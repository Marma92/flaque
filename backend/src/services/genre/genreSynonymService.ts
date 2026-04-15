import fs from "node:fs";

import { createLogger } from "../../utils/logger";
import { configRoot } from "../../utils/paths";
import path from "node:path";

const log = createLogger("genre-synonyms");

const SYNONYMS_FILE = path.join(configRoot, "genre-synonyms.json");

type SynonymMap = Record<string, string>;

const DEFAULT_SYNONYMS: SynonymMap = {
  "prog rock": "Progressive Rock",
  "prog": "Progressive Rock",
  "synth pop": "Synthpop",
  "synth-pop": "Synthpop",
  "synthwave": "Synthwave",
  "retrowave": "Synthwave",
  "hiphop": "Hip-Hop",
  "hip hop": "Hip-Hop",
  "rap": "Hip-Hop",
  "r&b": "R&B",
  "rnb": "R&B",
  "rhythm and blues": "R&B",
  "electronica": "Electronic",
  "electro": "Electronic",
  "edm": "Electronic",
  "techno": "Techno",
  "house music": "House",
  "deep house": "Deep House",
  "drum and bass": "Drum & Bass",
  "dnb": "Drum & Bass",
  "d&b": "Drum & Bass",
  "drum n bass": "Drum & Bass",
  "alt rock": "Alternative Rock",
  "alt-rock": "Alternative Rock",
  "alternative": "Alternative Rock",
  "indie": "Indie Rock",
  "indie rock": "Indie Rock",
  "post punk": "Post-Punk",
  "post-punk": "Post-Punk",
  "postpunk": "Post-Punk",
  "shoegaze": "Shoegaze",
  "shoe gaze": "Shoegaze",
  "dream pop": "Dream Pop",
  "dreampop": "Dream Pop",
  "lo-fi": "Lo-Fi",
  "lofi": "Lo-Fi",
  "lo fi": "Lo-Fi",
  "heavy metal": "Heavy Metal",
  "metal": "Metal",
  "thrash metal": "Thrash Metal",
  "thrash": "Thrash Metal",
  "death metal": "Death Metal",
  "black metal": "Black Metal",
  "doom metal": "Doom Metal",
  "nu metal": "Nu Metal",
  "nu-metal": "Nu Metal",
  "numetal": "Nu Metal",
  "punk rock": "Punk",
  "punk": "Punk",
  "pop punk": "Pop Punk",
  "pop-punk": "Pop Punk",
  "classic rock": "Classic Rock",
  "hard rock": "Hard Rock",
  "hardrock": "Hard Rock",
  "blues rock": "Blues Rock",
  "southern rock": "Southern Rock",
  "psychedelic rock": "Psychedelic Rock",
  "psych rock": "Psychedelic Rock",
  "psychedelic": "Psychedelic Rock",
  "grunge": "Grunge",
  "folk": "Folk",
  "folk rock": "Folk Rock",
  "country": "Country",
  "bluegrass": "Bluegrass",
  "jazz": "Jazz",
  "smooth jazz": "Smooth Jazz",
  "bebop": "Bebop",
  "bossa nova": "Bossa Nova",
  "soul": "Soul",
  "funk": "Funk",
  "disco": "Disco",
  "reggae": "Reggae",
  "ska": "Ska",
  "dub": "Dub",
  "dancehall": "Dancehall",
  "classical": "Classical",
  "orchestral": "Orchestral",
  "chamber music": "Chamber Music",
  "ambient": "Ambient",
  "new age": "New Age",
  "newage": "New Age",
  "world": "World Music",
  "world music": "World Music",
  "latin": "Latin",
  "bossa": "Bossa Nova",
  "flamenco": "Flamenco",
  "afrobeat": "Afrobeat",
  "afro beat": "Afrobeat",
  "k-pop": "K-Pop",
  "kpop": "K-Pop",
  "j-pop": "J-Pop",
  "jpop": "J-Pop",
  "j-rock": "J-Rock",
  "jrock": "J-Rock",
  "trip hop": "Trip-Hop",
  "trip-hop": "Trip-Hop",
  "triphop": "Trip-Hop",
  "downtempo": "Downtempo",
  "chillout": "Chillout",
  "chill out": "Chillout",
  "chill": "Chillout",
  "idm": "IDM",
  "industrial": "Industrial",
  "ebm": "EBM",
  "noise": "Noise",
  "experimental": "Experimental",
  "avant-garde": "Avant-Garde",
  "avantgarde": "Avant-Garde",
  "avant garde": "Avant-Garde",
  "gospel": "Gospel",
  "christian": "Christian",
  "worship": "Worship",
  "soundtrack": "Soundtrack",
  "ost": "Soundtrack",
  "film score": "Soundtrack",
  "score": "Soundtrack",
  "game music": "Video Game Music",
  "video game": "Video Game Music",
  "vgm": "Video Game Music",
  "chiptune": "Chiptune",
  "8-bit": "Chiptune",
  "8bit": "Chiptune",
  "garage rock": "Garage Rock",
  "garage": "Garage Rock",
  "math rock": "Math Rock",
  "mathrock": "Math Rock",
  "emo": "Emo",
  "screamo": "Screamo",
  "hardcore": "Hardcore",
  "hardcore punk": "Hardcore",
  "metalcore": "Metalcore",
  "deathcore": "Deathcore",
  "post rock": "Post-Rock",
  "post-rock": "Post-Rock",
  "postrock": "Post-Rock",
  "stoner rock": "Stoner Rock",
  "stoner": "Stoner Rock",
  "sludge": "Sludge Metal",
  "sludge metal": "Sludge Metal",
  "progressive metal": "Progressive Metal",
  "prog metal": "Progressive Metal",
  "power metal": "Power Metal",
  "symphonic metal": "Symphonic Metal",
  "folk metal": "Folk Metal",
  "viking metal": "Viking Metal",
  "glam rock": "Glam Rock",
  "glam": "Glam Rock",
  "new wave": "New Wave",
  "new-wave": "New Wave",
  "darkwave": "Darkwave",
  "dark wave": "Darkwave",
  "goth": "Gothic",
  "gothic": "Gothic",
  "gothic rock": "Gothic Rock",
  "trance": "Trance",
  "psytrance": "Psytrance",
  "psy trance": "Psytrance",
  "hardstyle": "Hardstyle",
  "dubstep": "Dubstep",
  "brostep": "Dubstep",
  "trap": "Trap",
  "future bass": "Future Bass",
  "vaporwave": "Vaporwave",
  "mallsoft": "Vaporwave",
  "witch house": "Witch House",
  "cloud rap": "Cloud Rap",
  "boom bap": "Boom Bap",
  "gangsta rap": "Gangsta Rap",
  "conscious hip-hop": "Conscious Hip-Hop",
  "conscious rap": "Conscious Hip-Hop",
  "neo soul": "Neo Soul",
  "neo-soul": "Neo Soul",
  "contemporary r&b": "Contemporary R&B",
  "mpb": "MPB",
  "samba": "Samba",
  "cumbia": "Cumbia",
  "reggaeton": "Reggaeton",
  "bachata": "Bachata",
  "salsa": "Salsa",
  "merengue": "Merengue",
  "tango": "Tango"
};

let synonyms: SynonymMap | null = null;

function loadSynonyms(): SynonymMap {
  if (synonyms) return synonyms;

  try {
    if (fs.existsSync(SYNONYMS_FILE)) {
      const raw = fs.readFileSync(SYNONYMS_FILE, "utf8");
      synonyms = JSON.parse(raw) as SynonymMap;
      return synonyms;
    }
  } catch {
    log.warn("Failed to load genre synonyms file, using defaults");
  }

  synonyms = { ...DEFAULT_SYNONYMS };
  saveSynonyms();
  return synonyms;
}

function saveSynonyms(): void {
  if (!synonyms) return;

  try {
    fs.mkdirSync(path.dirname(SYNONYMS_FILE), { recursive: true });
    const sorted = Object.fromEntries(
      Object.entries(synonyms).sort(([a], [b]) => a.localeCompare(b))
    );
    fs.writeFileSync(SYNONYMS_FILE, JSON.stringify(sorted, null, 2), "utf8");
  } catch (error) {
    log.warn("Failed to save genre synonyms", {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

export function normalizeGenreLabel(genre: string): string {
  const map = loadSynonyms();
  const key = genre.trim().toLowerCase();
  return map[key] ?? genre.trim();
}

export function normalizeGenreLabels(genres: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const genre of genres) {
    const normalized = normalizeGenreLabel(genre);
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }

  return result;
}

export function getSynonyms(): SynonymMap {
  return { ...loadSynonyms() };
}

export function setSynonym(from: string, to: string): void {
  const map = loadSynonyms();
  map[from.trim().toLowerCase()] = to.trim();
  saveSynonyms();
}

export function removeSynonym(from: string): boolean {
  const map = loadSynonyms();
  const key = from.trim().toLowerCase();
  if (!(key in map)) return false;
  delete map[key];
  saveSynonyms();
  return true;
}

export function resetSynonymsToDefaults(): void {
  synonyms = { ...DEFAULT_SYNONYMS };
  saveSynonyms();
}
