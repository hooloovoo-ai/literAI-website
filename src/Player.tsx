import { Alert, Box, Container, Fade, Snackbar, Theme, useMediaQuery } from "@mui/material";
import Grid from "@mui/system/Unstable_Grid";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LoaderFunctionArgs, useLoaderData } from "react-router-dom";
import deepEqual from "deep-equal";
import ReactAudioPlayer from "react-audio-player";

const FADE_DURATION_MS = 2000;
const FADE_DURATION_SECS = FADE_DURATION_MS / 1000;
const LISTEN_INTERVAL = 250;

export async function loader(loaderArgs: LoaderFunctionArgs) {
  return loaderArgs.params.title;
}

async function fetchJSON(url: string) {
  const response = await fetch(url);
  return response.json();
}

interface TitleIndex {
  title: string,
  author: string,
  slug: string,
  parts: string[]
}

interface Part {
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
  lines: {
    speaker: number,
    text: string,
    summary?: number,
    start: number,
    end: number,
    audio?: string
  }[],
  duration: number,
  audio: string
}

interface ImageInfo {
  src: string;
  alt: string;
  start: number;
  in: boolean
  duration: number,
  time: number,
}

function findImageIndiciesForTime(imageInfos: ImageInfo[], time: number): [number, number] {
  if (imageInfos.length === 0)
    return [-1, -1];

  let left: number = 0;
  let right: number = imageInfos.length - 1;

  let mid: number = -1;
  while (left <= right) {
    mid = Math.floor((left + right) / 2);

    if (imageInfos[mid].start === time)
      break;
    if (time < imageInfos[mid].start)
      right = mid - 1;
    else
      left = mid + 1;
  }

  if (mid > 0 && imageInfos[mid - 1].start < time)
    mid -= 1;

  while (mid > 0) {
    if (imageInfos[mid - 1].start === imageInfos[mid].start)
      mid -= 1;
    else
      break;
  }

  let end = mid;
  while (end < imageInfos.length - 1) {
    if (imageInfos[end + 1].start === imageInfos[end].start)
      end += 1;
    else
      break;
  }

  return [mid, end];
}

export default function Player() {
  const title = useLoaderData() as string;

  const storageBase = useMemo(() => `${process.env.REACT_APP_STORAGE_BASE}/${title}`, [title]);

  const [errorMessage, setErrorMessage] = useState<string>();
  const handleErrorClose = useCallback((event?: React.SyntheticEvent | Event, reason?: string) => {
    if (reason === 'clickaway') {
      return;
    }
    setErrorMessage(undefined);
  }, []);

  const [index, setIndex] = useState<TitleIndex>();
  useEffect(() => {
    if (storageBase) {
      fetchJSON(`${storageBase}/index.json`)
        .catch(err => setErrorMessage(err.toString()))
        .then(data => setIndex(data));
    }
  }, [storageBase, title]);

  // TODO: make selectable / pull from redux
  const [currentPartIndex, setCurrentPartIndex] = useState(0);

  const [part, setPart] = useState<Part>();
  useEffect(() => {
    if (storageBase && index) {
      fetchJSON(`${storageBase}/${index.parts[currentPartIndex]}`)
        .catch(err => setErrorMessage(err.toString()))
        .then(data => setPart(data));
    }
  }, [index, storageBase, currentPartIndex]);

  const allImages = useMemo(() => {
    if (part) {
      const result: ImageInfo[] = [];

      // find first non-intro line
      const firstLineStart = part.lines.find(line => line.summary !== undefined)?.start || 0;

      // title
      result.push(...part.images.map((item) => ({
        src: `${storageBase}/${item}`,
        alt: part.book_title,
        start: 0,
        in: true,
        duration: firstLineStart,
        time: 0
      })));

      // lines
      let currentSummary: number | undefined = undefined;
      let currentSummaryLines: ImageInfo[] = [];
      for (const line of part.lines) {
        if (line.summary !== undefined && currentSummary !== line.summary) {
          for (const previousLine of currentSummaryLines)
            previousLine.duration = line.start - previousLine.start;

          currentSummary = line.summary;
          const summary = part.summaries[line.summary];

          currentSummaryLines = summary.images.map((item, index) => ({
            src: `${storageBase}/${item}`,
            alt: summary.descriptions[index],
            start: line.start,
            in: true,
            duration: 0,
            time: 0
          }));
          result.push(...currentSummaryLines);
        }
      }

      for (const previousLine of currentSummaryLines)
        previousLine.duration = part.duration - previousLine.start;

      return result;
    } else {
      return [];
    }
  }, [part, storageBase]);

  const breakpointLgOnly = useMediaQuery((theme: Theme) => theme.breakpoints.only("lg"));
  const breakpointXlUp = useMediaQuery((theme: Theme) => theme.breakpoints.up("xl"));
  const numImages = useMemo(() => breakpointXlUp ? 3 : (breakpointLgOnly ? 2 : 1), [breakpointXlUp, breakpointLgOnly]);

  const [imageInfos, setImageInfos] = useState<(ImageInfo | undefined)[]>([]);

  const player = useRef<ReactAudioPlayer>(null);

  const [position, setPosition] = useState(-1);
  const onListen = useCallback((time: number) => {
    setPosition(time);
  }, []);

  const onSeeked = useCallback((e: Event) => {
    setPosition(player.current?.audioEl.current?.currentTime || 0);
  }, [player]);

  const [imageBounds, setImageBounds] = useState<[number, number]>();
  const [lastShownImageIndexAndTime, setLastShownImageIndexAndTime] = useState<[number, number]>();

  useEffect(() => {
    if (allImages.length === 0 || position < 0 || !player)
      return;
    const newImageBounds = findImageIndiciesForTime(allImages, position);
    if (deepEqual(newImageBounds, imageBounds)) {
      setImageInfos(imageInfos => {
        let changed = false;
        const isStart = !imageInfos.reduce((prev, curr) => !!curr?.in || prev, false);
        const paused = !!player.current?.audioEl.current?.paused;
        const newImageInfos = imageInfos.map((imageInfo, index) => {
          if (imageInfo) {
            if (position >= imageInfo.time) {
              changed = true;
              if (imageInfo.in && !paused) {
                imageInfo.in = false;
                imageInfo.time = position + FADE_DURATION_SECS;
                return imageInfo;
              } else {
                const newImageInfo = allImages[newImageBounds[0] + index];
                newImageInfo.in = true;
                newImageInfo.time = position + FADE_DURATION_SECS;
                return newImageInfo;
              }
            }
          }
        });
        if (changed)
          console.log("updated images");
        return changed ? [...newImageInfos] : imageInfos;
      });
    } else { 
      setImageInfos(imageInfos => {
        if (position == 0)
          imageInfos = allImages.slice(0, numImages);
        imageInfos.forEach(image => {
          if (image) {
            image.in = false;
            image.time = position;
          }
        });
        return [...imageInfos];
      });
      setImageBounds(newImageBounds);
    }
  }, [allImages, player, position, imageBounds]);

  return (
    <Container maxWidth={false} sx={{ height: "100vh" }}>
      <Grid container spacing={1}>
        {
          imageInfos.map((imageInfo, index) => (
            <Grid xs={4} key={index}>
              <Box sx={{ padding: 2 }}>
                {
                  imageInfo ?
                    <Fade in={imageInfo.in} timeout={FADE_DURATION_MS}>
                      <img width="100%" src={imageInfo.src} alt={imageInfo.alt} />
                    </Fade> :
                    <div />
                }
              </Box>
            </Grid>
          ))
        }
        <Grid xs={12}>
        </Grid>
        <Grid xs={12}>
          {
            storageBase && part ?
              <ReactAudioPlayer style={{ width: "100%" }} src={`${storageBase}/${part.audio}`} ref={player} listenInterval={LISTEN_INTERVAL} onListen={onListen} onSeeked={onSeeked} onCanPlay={onSeeked} controls /> :
              <div />
          }
        </Grid>
      </Grid>

      <Snackbar open={errorMessage !== undefined} autoHideDuration={10000} onClose={handleErrorClose}>
        <Alert onClose={handleErrorClose} severity="error" sx={{ width: '100%' }}>
          {errorMessage}
        </Alert>
      </Snackbar>
    </Container>
  );
}
