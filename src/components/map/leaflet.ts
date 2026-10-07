// Shared Leaflet setup for the map page and the pin editor (both lazy chunks, so Leaflet never
// lands in the main bundle). Plain Leaflet, no React wrapper: we only need markers, clusters and a pin.
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
// markercluster is a classic plugin: it attaches itself to the global `L` that Leaflet 1.x sets, so it must
// be imported after leaflet. Only the base CSS (animations); cluster bubbles are styled in index.css.
import 'leaflet.markercluster'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import type { CategoryKey } from '@/lib/constants'

export { L }

export const OSM_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
export const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'

export function addBaseLayer(map: L.Map): L.TileLayer {
  return L.tileLayer(OSM_TILES, { maxZoom: 19, attribution: OSM_ATTRIBUTION }).addTo(map)
}

export function iconMarkup(sprites: HTMLElement | null, category: CategoryKey): string {
  return sprites?.querySelector(`[data-category="${category}"]`)?.innerHTML ?? ''
}

const PIN_PATH = 'M16 1.5C8 1.5 1.5 7.9 1.5 15.9 1.5 26.6 16 40.5 16 40.5S30.5 26.6 30.5 15.9C30.5 7.9 24 1.5 16 1.5Z'

/** A teardrop pin in `fill`, with the category icon in a white disc. */
export function pinIcon({ fill, icon, iconColor, dimmed, label }: {
  fill: string
  icon: string
  iconColor: string
  dimmed?: boolean
  label: string
}): L.DivIcon {
  const html = `
    <span class="tabi-pin${dimmed ? ' is-dimmed' : ''}" title="${escapeHtml(label)}">
      <svg class="tabi-pin-shape" viewBox="0 0 32 42" width="32" height="42" aria-hidden="true">
        <path d="${PIN_PATH}" fill="${fill}" stroke="#ffffff" stroke-width="2"/>
        <circle cx="16" cy="16" r="10" fill="#ffffff"/>
      </svg>
      <span class="tabi-pin-icon" style="color:${iconColor}">${icon}</span>
    </span>`
  return L.divIcon({ html, className: 'tabi-pin-root', iconSize: [32, 42], iconAnchor: [16, 41], popupAnchor: [0, -36] })
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

/** Round count bubble for a cluster of pins (styled with theme tokens in index.css). */
export function clusterIcon(cluster: L.MarkerCluster): L.DivIcon {
  const count = cluster.getChildCount()
  const size = count < 10 ? 38 : count < 50 ? 44 : 50
  return L.divIcon({
    // Clusters are keyboard-focusable buttons, so they need a name.
    html: `<span class="sr-only">${count} places here — zoom in</span><span aria-hidden="true">${count}</span>`,
    className: 'tabi-cluster',
    iconSize: [size, size],
  })
}
