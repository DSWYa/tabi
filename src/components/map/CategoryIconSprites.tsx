import type { Ref } from 'react'
import { categoryIcons } from '@/components/categoryIcons'
import { CATEGORIES } from '@/lib/constants'

/**
 * Hidden copies of the category icons. Leaflet markers are plain HTML, so we copy each icon's SVG
 * markup out of here instead of shipping a second icon set.
 */
export function CategoryIconSprites({ ref }: { ref: Ref<HTMLDivElement> }) {
  return (
    <div ref={ref} hidden>
      {CATEGORIES.map(({ key }) => {
        const Icon = categoryIcons[key]
        return (
          <span key={key} data-category={key}>
            <Icon width={16} height={16} aria-hidden />
          </span>
        )
      })}
    </div>
  )
}

