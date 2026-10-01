export class LocalPreviews {
  constructor(urls = URL) {
    this.urls = urls;
    this.pending = [];
    this.active = [];
  }
  select(files) {
    this.pending = Array.from(files);
  }
  complete() {
    const files = this.pending;
    this.pending = [];
    const previews = files.map((file) => this.urls.createObjectURL(file));
    this.active.push(...previews);
    return previews;
  }
  dispose() {
    for (const url of this.active) this.urls.revokeObjectURL(url);
    this.active = [];
    this.pending = [];
  }
}
