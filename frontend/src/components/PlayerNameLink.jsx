import { useQuery } from '@tanstack/react-query'
import { api } from '../api'
import PlayerLink from './PlayerLink'

export default function PlayerNameLink({ name, textClassName = '', imageClassName = 'w-4 h-4' }) {
  const { data } = useQuery({
    queryKey: ['player-search', name],
    queryFn: () => api.players.search(name),
    staleTime: 30 * 60_000,
    enabled: !!name && name.length >= 2,
  })

  const playerId = data?.[0]?.id

  return (
    <PlayerLink
      playerId={playerId}
      name={name}
      textClassName={textClassName}
      imageClassName={imageClassName}
    />
  )
}
