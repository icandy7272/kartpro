export type MapMode = 'align' | 'training' | 'satellite'

export type MapSurface = 'analysis' | 'trackSetup' | 'startFinish'

export interface MapModeMeta {
  label: string
  shortLabel: string
  description: string
}

export const MAP_MODE_ORDER: MapMode[] = ['align', 'training', 'satellite']

export const MAP_MODE_META: Record<MapMode, MapModeMeta> = {
  align: {
    label: '对齐模式',
    shortLabel: '对齐',
    description: '查看行车线与赛道边界、宽度和走位关系。',
  },
  training: {
    label: '训练模式',
    shortLabel: '训练',
    description: '聚焦日常训练中的节奏、速度和线路对比。',
  },
  satellite: {
    label: '卫星模式',
    shortLabel: '卫星',
    description: '确认真实赛道细节、路肩和参考地标。',
  },
}

export const DEFAULT_MAP_MODE_BY_SURFACE: Record<MapSurface, MapMode> = {
  analysis: 'satellite',
  trackSetup: 'satellite',
  startFinish: 'satellite',
}
