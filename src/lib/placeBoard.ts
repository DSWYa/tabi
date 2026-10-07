import { useCallback, useMemo } from 'react'
import { useMe } from './members'
import { usePlaces, useVotes } from './places'
import { tallyByPlace, tallyFor } from './votes'

/** Places + votes + members, joined once for the list pages, the map and the dashboard. */
export function usePlaceBoard() {
  const places = usePlaces()
  const votes = useVotes()
  const { me, isAdmin, data: members = [] } = useMe()

  const memberIds = useMemo(() => members.map((m) => m.id), [members])
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members])
  const tallies = useMemo(() => tallyByPlace(votes.data ?? [], memberIds), [votes.data, memberIds])
  const tallyOf = useCallback((placeId: string) => tallyFor(tallies, placeId, memberIds), [tallies, memberIds])

  return {
    places: places.data,
    isPending: places.isPending || votes.isPending,
    // A failed refresh keeps the cached data (offline reading); only "nothing to show" is an error.
    isError: (places.isError && !places.data) || (votes.isError && !votes.data),
    refetch: () => Promise.all([places.refetch(), votes.refetch()]),
    me,
    isAdmin,
    members,
    memberById,
    tallies,
    tallyOf,
  }
}
