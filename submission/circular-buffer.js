export class CircularBuffer {
  constructor(size) {
    this.data = new Array(size);
    this.size = size;
    this.head = 0;
    this.tail = 0;
    this.count = 0;
  }

  add(value) {
    if (this.isFull()) {
      this.tail = (this.tail + 1) % this.size;
      this.count--;
    }
    this.data[this.head] = value;
    this.head = (this.head + 1) % this.size;
    this.count++;
  }

  get() {
    if (this.isEmpty()) {
      return undefined;
    }
    return this.data[this.tail];
  }

  remove() {
    if (this.isEmpty()) {
      return undefined;
    }
    const value = this.data[this.tail];
    this.data[this.tail] = undefined;
    this.tail = (this.tail + 1) % this.size;
    this.count--;
    return value;
  }

  fill(value) {
    for(let i = 0; i < this.size; i++) {
      this.add(value)
    }
  }

  empty() {
    while(!this.isEmpty()) {
      this.remove()
    }
  }

  isFull() {
    return this.count === this.size;
  }

  isEmpty() {
    return this.count === 0;
  }
}
