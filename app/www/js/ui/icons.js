// Built-in SVG icons (no file to load, so nothing can be missing offline). Drawn with currentColor.
const S = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
const F = 'fill="currentColor"';
const PATHS = {
  play: `<path ${F} d="M8 5v14l11-7z"/>`,
  replay: `<path ${S} d="M20 12a8 8 0 1 1-2.6-5.9"/><path ${S} d="M20 4v5h-5"/>`,
  check: `<path ${S} stroke-width="3" d="M4 12l5 5L20 6"/>`,
  trash: `<path ${S} d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13"/>`,
  volume: `<path ${F} d="M3 9v6h4l5 4V5L7 9H3z"/><path ${S} d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12"/>`,
  mic: `<path ${S} d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z"/><path ${S} d="M5 11a7 7 0 0 0 14 0M12 18v3"/>`,
  tap: `<circle ${F} cx="12" cy="12" r="3"/><circle ${S} cx="12" cy="12" r="7"/><circle ${S} cx="12" cy="12" r="10.5" stroke-dasharray="2 3"/>`,
  adult: `<circle ${S} cx="12" cy="6" r="3.5"/><path ${S} d="M5 22v-6a7 7 0 0 1 14 0v6"/>`,
  child: `<circle ${S} cx="9" cy="11" r="2.8"/><path ${S} d="M4 22v-3.5a5 5 0 0 1 10 0V22"/><circle ${S} cx="18" cy="19" r="2.5"/>`,
  star: `<path ${F} d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>`,
  swap: `<path ${S} d="M7 7h12l-3-3M17 17H5l3 3"/>`,
  cloudoff: `<path ${S} d="M7 18a4 4 0 0 1-.5-8A6 6 0 0 1 18 9a4.5 4.5 0 0 1 .5 9H7z"/><path ${S} d="M3 3l18 18"/>`,
  alert: `<circle ${S} cx="12" cy="12" r="9"/><path ${S} d="M12 7v6M12 16.5v.5"/>`,
};

export function icon(name, size = 64) {
  const wrap = document.createElement("span");
  wrap.style.display = "inline-flex";
  wrap.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">${PATHS[name] ?? PATHS.alert}</svg>`;
  return wrap;
}
