export interface TitleIndex {
  title: string,
  author: string,
  slug: string,
  parts: string[]
}

export interface Line {
  speaker: number,
  text: string,
  summary?: number,
  start: number,
  end: number,
  audio?: string
}

export interface Part {
  book_title: string,
  book_author: string,
  part: number,
  num_parts: number,
  speakers: string[],
  summaries: {
    text: string,
    batch: number,
    descriptions: string[],
    images: string[]
  }[],
  images: [],
  lines: Line[],
  duration: number,
  audio: string
}
