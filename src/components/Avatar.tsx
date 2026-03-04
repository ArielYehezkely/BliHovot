interface AvatarProps {
  src: string | null
  name: string
  size?: 'sm' | 'md' | 'lg'
}

const sizeMap = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-11 h-11 text-sm',
  lg: 'w-16 h-16 text-xl',
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

const bgColors = [
  'bg-coral-light',
  'bg-mint-light',
  'bg-lavender-light',
  'bg-yellow-light',
]

function getColorForName(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return bgColors[Math.abs(hash) % bgColors.length]
}

export function Avatar({ src, name, size = 'md' }: AvatarProps) {
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={`${sizeMap[size]} rounded-full object-cover ring-2 ring-white shadow-sm`}
      />
    )
  }

  return (
    <div
      className={`${sizeMap[size]} ${getColorForName(name)} rounded-full flex items-center justify-center font-semibold text-white ring-2 ring-white shadow-sm`}
    >
      {getInitials(name)}
    </div>
  )
}
