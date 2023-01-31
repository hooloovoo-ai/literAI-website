import { Alert, AppBar, Box, Fade, IconButton, MenuItem, Select, Snackbar, Stack, Theme, Toolbar, Typography, useMediaQuery, useTheme } from "@mui/material";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LoaderFunctionArgs, useLoaderData, useNavigate } from "react-router-dom";
import deepEqual from "deep-equal";
import ReactAudioPlayer from "react-audio-player";
import { fetchJSON } from "./util";
import { Line, Part, TitleIndex } from "./types";
import { ArrowBack } from "@mui/icons-material";

const FADE_DURATION_MS = 2000;
const FADE_DURATION_SECS = FADE_DURATION_MS / 1000;
const IMAGE_BLACK_SECS = .2;
const IMAGE_DURATION_SECS = FADE_DURATION_SECS * 3;
const LISTEN_INTERVAL = 33;

export async function loader(loaderArgs: LoaderFunctionArgs) {
  return loaderArgs.params.title;
}

interface ImageInfo {
  src: string;
  alt: string;
  start: number;
  in: boolean | null
  duration: number,
  time: number,
  index: number
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

function findLineIndexByTime(lines: Line[], time: number): number {
  let left: number = 0;
  let right: number = lines.length - 1;

  let mid = -1;
  while (left <= right) {
    mid = Math.floor((left + right) / 2);

    if (time >= lines[mid].start && time <= lines[mid].end) return mid;
    if (time < lines[mid].start) right = mid - 1;
    else left = mid + 1;
  }

  return mid;
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
      result.push(...part.images.map((item, index) => ({
        src: `${storageBase}/${item}`,
        alt: part.book_title,
        start: 0,
        in: true,
        duration: firstLineStart,
        time: 0,
        index
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
            time: 0,
            index: result.length + index
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

  const [didSeek, setDidSeek] = useState(false);
  const onSeeked = useCallback((e: Event) => {
    setPosition(player.current?.audioEl.current?.currentTime || 0);
    setDidSeek(true);
  }, [player]);

  const [imageBounds, setImageBounds] = useState<[number, number]>();

  useEffect(() => {
    if (allImages.length === 0 || position < 0 || !player)
      return;
    const newImageBounds = findImageIndiciesForTime(allImages, position);
    const paused = !!player.current?.audioEl.current?.paused;
    if (deepEqual(newImageBounds, imageBounds) && !paused && !didSeek) {
      setImageInfos(imageInfos => {
        let changed = false;
        const newImageInfos = imageInfos.map((imageInfo, index) => {
          if (imageInfo) {
            if (position >= imageInfo.time) {
              changed = true;
              if (imageInfo.in === true) {
                imageInfo.in = false;
                imageInfo.time = position + FADE_DURATION_SECS;
              }
              else if (imageInfo.in === false) {
                // set the new image, and stay black for a little time because we may need to go download it
                const numberOfImagesToChooseFrom = newImageBounds[1] - newImageBounds[0] + 1;
                const newImageIndex = ((imageInfo.index - newImageBounds[0] + numImages) % numberOfImagesToChooseFrom) + newImageBounds[0];
                const newImageInfo = { ...allImages[newImageIndex] };
                newImageInfo.in = null;
                newImageInfo.time = position + IMAGE_BLACK_SECS;
                return newImageInfo;
              }
              else {
                imageInfo.in = true;
                imageInfo.time = position + (IMAGE_DURATION_SECS + IMAGE_BLACK_SECS) * numImages;
                return imageInfo;
              }
            }
          }
          return imageInfo;
        });
        return changed ? [...newImageInfos] : imageInfos;
      });
    } else {
      if (paused || didSeek) {
        setImageInfos(imageInfos => !!player.current?.audioEl.current?.paused ?
          allImages.slice(newImageBounds[0], newImageBounds[0] + numImages).map((imageInfo, index) => {
            imageInfo.in = true;
            imageInfo.time = position + IMAGE_DURATION_SECS + (IMAGE_DURATION_SECS + FADE_DURATION_SECS + IMAGE_BLACK_SECS) * index;
            return imageInfo;
          }) :
          imageInfos
        );
      }
      setImageBounds(imageBounds => deepEqual(imageBounds, newImageBounds) ? imageBounds : newImageBounds);
      setDidSeek(false);
    }
  }, [allImages, player, position, imageBounds, numImages, didSeek]);

  const [currentLine, setCurrentLine] = useState<number>();
  const [pastTranscript, setPastTranscript] = useState<Line[]>([]);

  useEffect(() => {
    if (!part || position < 0 || !player)
      return;
    const newCurrentLine = findLineIndexByTime(part.lines, position);
    const paused = !!player.current?.audioEl.current?.paused;
    setCurrentLine(prevCurrentLine => {
      if (prevCurrentLine !== newCurrentLine && !paused && !didSeek) {
        if (prevCurrentLine !== undefined)
          setPastTranscript(prevPastTranscript => {
            if (prevPastTranscript.length !== 0 && prevPastTranscript[prevPastTranscript.length - 1].text === part.lines[prevCurrentLine].text)
              return prevPastTranscript;
            return [...prevPastTranscript, part.lines[prevCurrentLine]];
          });
      }
      return newCurrentLine;
    });
  }, [player, position, part, didSeek]);

  const splitCurrentLine = useMemo<string[]>(() =>
    currentLine !== undefined && part !== undefined ? part.lines[currentLine].text.split(' ') : []
    , [currentLine, part]);

  const theme = useTheme();
  const scrollIntoViewRef = useRef<HTMLDivElement>(null);
  const performScrolldown = useRef(false);
  useEffect(() => {
    if (!player || didSeek)
      return;
    const paused = !!player.current?.audioEl.current?.paused;
    if (paused)
      return;
    if (performScrolldown.current) {
      setTimeout(() => scrollIntoViewRef?.current?.scrollIntoView({ behavior: "auto", block: "nearest" }), 500);
    }
    performScrolldown.current = true;
  }, [currentLine, player, didSeek, position]);

  const navigate = useNavigate();
  const onBack = useCallback(() => {
    navigate('/');
  }, [navigate]);

  return (
    <Box width="100vw" height="100vh" display="flex" flexDirection="column">
      <AppBar position="static">
        <Toolbar>
          <IconButton size="large" edge="start" color="inherit" aria-label="back" sx={{ mr: 2 }} onClick={onBack} >
            <ArrowBack />
          </IconButton>
          <Typography variant="h4" component="div" sx={{ mr: 2 }} >
            {part?.book_title ?? ''}
          </Typography>
          <Typography variant="h6" component="div" color="text.secondary" sx={{ flexGrow: 1 }}>
            {part?.book_author ?? ''}
          </Typography>
          <Select value={currentPartIndex}>
          {
              part ?
                Array.from(Array(part.num_parts).keys()).map(i => (
                  <MenuItem value={i}>{`Part ${i + 1}`}</MenuItem>
                )) : <Box />
            }
          </Select>
        </Toolbar>
      </AppBar>
      <Stack direction="row" spacing={2} justifyContent="center" alignItems="center" mt={2}>
        {
          imageInfos.map((imageInfo, index) => (
            <Box key={index}>
              {
                imageInfo ?
                  <Fade in={!!imageInfo.in} timeout={FADE_DURATION_MS}>
                    <img style={{ maxWidth: "100%", height: "auto" }} src={imageInfo.src} alt={imageInfo.alt} />
                  </Fade> :
                  <Box />
              }
            </Box>
          ))
        }
      </Stack>
      <Box overflow="auto" flex={1} margin={2}>
        {
          pastTranscript && part ?
            pastTranscript.map((transcript, index) => (
              <p key={index}>
                <span style={{ color: theme.palette.secondary.main }}>
                  {part.speakers[transcript.speaker]}
                </span>
                <span style={{ color: theme.palette.text.disabled }}>: </span>
                {transcript.text}
              </p>
            )) :
            <Box />
        }
        {
          currentLine !== undefined && part && splitCurrentLine && position > 0 ?
            <p key="current">
              <span style={{ color: theme.palette.secondary.main }}>
                {part.speakers[part.lines[currentLine].speaker]}
              </span>
              <span style={{ color: theme.palette.text.disabled }}>: </span>
              {
                position >= part.lines[currentLine].start ?
                  splitCurrentLine.slice(0, Math.floor(((position - part.lines[currentLine].start) / (part.lines[currentLine].end - part.lines[currentLine].start)) * splitCurrentLine.length)).join(' ') :
                  ''
              }
            </p> :
            <Box />
        }
        <div key="scroll" ref={scrollIntoViewRef}></div>
      </Box>
      {
        storageBase && part ?
          <ReactAudioPlayer style={{ width: "100%" }} src={`${storageBase}/${part.audio}`} ref={player} listenInterval={LISTEN_INTERVAL} onListen={onListen} onSeeked={onSeeked} onCanPlay={onSeeked} controls /> :
          <Box />
      }
      <Snackbar open={errorMessage !== undefined} autoHideDuration={10000} onClose={handleErrorClose}>
        <Alert onClose={handleErrorClose} severity="error" sx={{ width: '100%' }}>
          {errorMessage}
        </Alert>
      </Snackbar>
    </Box>
  );
}
