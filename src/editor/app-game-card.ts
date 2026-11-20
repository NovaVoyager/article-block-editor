import Ajv from 'ajv'
import schema from '../protocol/app-game-card-v1.schema.json'

export type AppGameKind = 'app' | 'game'

export interface AppGameCardLabels {
  rating?: string
  version?: string
  developer?: string
}

export interface AppGameData {
  id: string | number
  name: string
  icon?: string
  category?: string
  rating?: number | string
  version?: string
  developer?: string
  /** Comma-separated image URLs from the catalog. */
  banner?: string
}

/** Synchronous host callback. An empty result hides the detail link. */
export type AppGameLinkResolver = (item: AppGameData, kind: AppGameKind) => string | null | undefined

export interface AppGameCardClick {
  item: AppGameData
  kind: AppGameKind
  href: string
  event: MouseEvent
}

export interface AppGamePickerScope {
  kind: AppGameKind
  current: AppGameData | null
  select(data: AppGameData): boolean
  cancel(): void
}

export interface AppGameCardAttrs {
  kind: AppGameKind
  item?: AppGameData | null
  displayImage?: string | null
  labels?: AppGameCardLabels | null
}

export function resolveAppGameCardLabels(host?: AppGameCardLabels, card?: AppGameCardLabels | null): Required<AppGameCardLabels> {
  return {
    rating: card?.rating ?? host?.rating ?? 'Rating',
    version: card?.version ?? host?.version ?? 'Version',
    developer: card?.developer ?? host?.developer ?? 'Developer',
  }
}

export const kindLabels = { app: '应用', game: '游戏' }
const ajv = new Ajv({ strict: false, strictNumbers: true })
export const validAppGameCard = ajv.compile(schema)
const itemSchema = schema.properties.attrs.properties.item
const validItem = ajv.compile<AppGameData>(itemSchema)

export function snapshotAppGame(data: AppGameData): AppGameData {
  const snapshot = Object.fromEntries(Object.keys(itemSchema.properties)
    .filter(key => data?.[key as keyof AppGameData] != null)
    .map(key => [key, data[key as keyof AppGameData]]))
  if (!validItem(snapshot)) throw new Error('请选择包含有效 ID 和名称的条目，并检查卡片字段格式')
  return snapshot
}

export function appGameAttrs({ kind, item, displayImage, labels }: AppGameCardAttrs = { kind: 'app' }) {
  return {
    kind,
    ...(item && { item: { ...item } }),
    ...(displayImage && { displayImage }),
    ...(labels && Object.keys(labels).length > 0 && { labels: { ...labels } }),
  }
}

export function firstBanner(banner?: string) {
  return banner?.split(',').map(url => url.trim()).find(Boolean) ?? ''
}
