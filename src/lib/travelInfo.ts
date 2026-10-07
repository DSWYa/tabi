import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from './auth'
import { LIMITS, TRAVEL_ICONS, type TravelIconKey } from './constants'
import { friendlyError } from './join'
import { ensureAffected } from './places'
import { placeAt, renumber } from './reorder'
import { supabase, type Tables } from './supabase'

// Travel Info: admin-edited sections (Flights, Hotel, …); members read only. Realtime invalidates this key.
export const travelKey = ['travel_sections'] as const

export type TravelSection = Omit<Tables<'travel_sections'>, 'icon'> & { icon: TravelIconKey | null }
export type SectionInput = Pick<TravelSection, 'title' | 'icon' | 'body'>

export function sortSections<T extends Pick<TravelSection, 'id' | 'sort_order' | 'created_at'>>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
}

/** Sections after moving one to `index` — the same renumbering move_travel_section() does. */
export function applySectionMove<T extends Pick<TravelSection, 'id' | 'sort_order' | 'created_at'>>(rows: T[], id: string, index: number): T[] {
  const order = renumber(placeAt(sortSections(rows).map((r) => r.id), id, index))
  return sortSections(rows.map((r) => ({ ...r, sort_order: order.get(r.id) ?? r.sort_order })))
}

export interface SectionFormValues {
  title: string
  icon: TravelIconKey | ''
  body: string
}

export function validateSection(values: SectionFormValues): Partial<Record<keyof SectionFormValues, string>> {
  const errors: Partial<Record<keyof SectionFormValues, string>> = {}
  const title = values.title.trim()
  if (!title) errors.title = 'Give the section a title.'
  else if (title.length > LIMITS.travelTitle) errors.title = `Keep the title under ${LIMITS.travelTitle} characters.`
  if (values.icon && !TRAVEL_ICONS.some((i) => i.key === values.icon)) errors.icon = 'Pick an icon from the list.'
  if (values.body.length > LIMITS.travelBody) errors.body = `Keep it under ${LIMITS.travelBody.toLocaleString('en-US')} characters.`
  return errors
}

export function sectionInput(values: SectionFormValues): SectionInput {
  return { title: values.title.trim(), icon: values.icon || null, body: values.body.replace(/\s+$/, '') }
}

export function useTravelSections() {
  const { session } = useAuth()
  return useQuery({
    queryKey: travelKey,
    enabled: Boolean(session),
    queryFn: async () => {
      const { data, error } = await supabase.from('travel_sections').select('*').order('sort_order').order('created_at')
      if (error) throw error
      return sortSections(data as TravelSection[])
    },
  })
}

function useTravelCache() {
  const queryClient = useQueryClient()
  return {
    queryClient,
    async update(change: (rows: TravelSection[]) => TravelSection[]) {
      await queryClient.cancelQueries({ queryKey: travelKey })
      const previous = queryClient.getQueryData<TravelSection[]>(travelKey)
      queryClient.setQueryData<TravelSection[]>(travelKey, (rows) => (rows ? sortSections(change(rows)) : rows))
      return { previous }
    },
    restore(context: { previous?: TravelSection[] } | undefined) {
      if (context?.previous) queryClient.setQueryData(travelKey, context.previous)
    },
    invalidate: () => queryClient.invalidateQueries({ queryKey: travelKey }),
  }
}

/** Create (no id) or update a section. New sections go to the end. */
export function useSaveSection() {
  const cache = useTravelCache()
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: SectionInput }) => {
      if (id) {
        const { data, error } = await supabase.from('travel_sections').update(input).eq('id', id).select('id')
        if (error) throw error
        ensureAffected(data, 'edit this section')
        return id
      }
      const rows = cache.queryClient.getQueryData<TravelSection[]>(travelKey) ?? []
      const sortOrder = rows.length ? Math.max(...rows.map((r) => r.sort_order)) + 1 : 0
      const { data, error } = await supabase
        .from('travel_sections')
        .insert({ ...input, sort_order: sortOrder })
        .select('id')
        .single()
      if (error) throw error
      return data.id
    },
    onMutate: ({ id, input }) => (id ? cache.update((rows) => rows.map((r) => (r.id === id ? { ...r, ...input } : r))) : undefined),
    onError: (_e, _v, context) => cache.restore(context),
    onSettled: cache.invalidate,
  })
}

export function useDeleteSection() {
  const cache = useTravelCache()
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.from('travel_sections').delete().eq('id', id).select('id')
      if (error) throw error
      ensureAffected(data, 'delete this section')
    },
    onMutate: (id) => cache.update((rows) => rows.filter((r) => r.id !== id)),
    onError: (_e, _v, context) => cache.restore(context),
    onSettled: cache.invalidate,
  })
}

export function useMoveSection() {
  const cache = useTravelCache()
  return useMutation({
    mutationFn: async ({ id, index }: { id: string; index: number }) => {
      const { error } = await supabase.rpc('move_travel_section', { section_id: id, to_index: index })
      if (error) throw error
    },
    onMutate: ({ id, index }) => cache.update((rows) => applySectionMove(rows, id, index)),
    onError: (_e, _v, context) => cache.restore(context),
    onSettled: cache.invalidate,
  })
}

export function travelErrorMessage(error: { code?: string; message?: string } | null | undefined): string {
  if (!error) return ''
  if (error.code === 'not_allowed') return error.message ?? ''
  if (error.code === '42501') return 'Only the admin can change Travel Info.'
  if (error.code === 'P0002') return 'That section was just removed by someone else.'
  if (error.code === '23514') return 'Check the title and icon, then try again.'
  return friendlyError(error)
}
