import { CircularBuffer } from "./circular-buffer.js";

// CPS -> Clicks Per Second
// PBR -> Playback Rate

// Grace period after video start with no click tracking (seconds)
const START_GRACE = 3;

// Grace period before video end with no click tracking (seconds)      
const END_GRACE = 3;

// CPS for unit PBR (x1.0)
const UNIT_CPS = 6;

// Maximum PBR reached at maximum CPS 
// MAX_CPS must be larger than or equal to sqrt(MAX_PBR) * UNIT_CPS
const MAX_PBR = 3;
const MAX_CPS = Math.max(12, Math.sqrt(MAX_PBR) * UNIT_CPS);

// CPS when clicks are first tracked 
// 0 -> Instantly show overlay message and pause video
// UNIT_CPS -> PBR will start normal and slow down gradually
const INITIAL_CPS = UNIT_CPS;

// Buffer size for running average of CPS 
// larger -> slower response time
const BUFFER_SIZE = 100;

// Can fail ad by not clicking for a length of time (seconds)
const CAN_FAIL = true;
const FAIL_TIME = 15;

// How long fail message is shown before posting fail event (seconds)
const FAIL_MESSAGE_TIME = 1;

const overlayContainer = document.getElementById("overlay-container");
const instructionContainer = document.getElementById("instruction-container");
const failContainer = document.getElementById("fail-container");
const linkElement = document.getElementById("link");

let buffer = new CircularBuffer(BUFFER_SIZE);
buffer.fill(INITIAL_CPS)

let clickTimestamps = [];
let averageCPS = INITIAL_CPS;
let animationFrameID = undefined;
let zeroCPSTimestamp = undefined;

window.addEventListener('message', (event) => {
    if (!event.data || !event.data.type) return;

    switch (event.data.type) {
        case 'adStarted':
            setTimeout(() => {
                overlayContainer.addEventListener("click", (e) => {
                    clickTimestamps.push(Date.now());
                })
                linkElement.addEventListener('click', (e) => {
                    cancelAnimationFrame(animationFrameID);
                    window.top.postMessage({ type: 'fail' }, '*');
                })
                animationFrameID = requestAnimationFrame(update);
            }, START_GRACE * 1000);
            break;
        case 'adFinished':
            window.top.postMessage({ type: 'success' }, '*');
            break;
        case 'timeupdate':
            {
                const { currentTime, duration } = event.data;
                const timeRemaining = duration - currentTime;

                // Reset playback rate and volume for ending grace period
                if (timeRemaining < END_GRACE) {
                    cancelAnimationFrame(animationFrameID);
                    window.top.postMessage({ type: 'setPlaybackRate', value: 1 }, '*');
                    window.top.postMessage({ type: 'setVolume', value: 1 }, '*');
                }
                break;
            }
    }
});

function update(timestamp) {
    const now = Date.now();
    clickTimestamps = clickTimestamps.filter(clickTime => now - clickTime < 1000);
    const cps = clickTimestamps.length;
    averageCPS += (cps - buffer.remove()) / BUFFER_SIZE;
    buffer.add(cps);
    const pbr = calculatePBR(averageCPS);
    const normalizedCPS = clamp(averageCPS / UNIT_CPS, 0, 1);
    window.top.postMessage({ type: 'setPlaybackRate', value: pbr }, '*');
    window.top.postMessage({ type: 'setVolume', value: normalizedCPS }, '*');
    overlayContainer.style.background = `rgba(0, 0, 0, ${0.8 - normalizedCPS})`;
    if (normalizedCPS > 0.01) {
        instructionContainer.style.display = "none";
        zeroCPSTimestamp = undefined;
    }
    else {
        instructionContainer.style.display = "flex";
        if (CAN_FAIL) {
            if (!zeroCPSTimestamp) {
                zeroCPSTimestamp = now;
            }
            else if (now - zeroCPSTimestamp >= FAIL_TIME * 1000) {
                instructionContainer.style.display = "none";
                failContainer.style.display = "flex";
                cancelAnimationFrame(animationFrameID);
                setTimeout(() => {
                    window.top.postMessage({ type: 'fail' }, '*');
                }, FAIL_MESSAGE_TIME * 1000);
                return;
            }
        }
    }
    animationFrameID = requestAnimationFrame(update)
}

//  Uses quadratic equation intersecting the three points (0,0), (UNIT_CPS, 1.0), and (MAX_CPS, MAX_PBR)
//  to interpolate PBR as a function of CPS
function calculatePBR(cps) {
    const d = UNIT_CPS * MAX_CPS * (MAX_CPS - UNIT_CPS);
    const a = (MAX_PBR * UNIT_CPS - MAX_CPS) / d;
    const b = (MAX_CPS * MAX_CPS - MAX_PBR * UNIT_CPS * UNIT_CPS) / d;
    let pbr = a * cps * cps + b * cps;
    pbr = pbr < 0.1 ? 0 : pbr;
    pbr = clamp(pbr, 0, MAX_PBR);
    return pbr;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
