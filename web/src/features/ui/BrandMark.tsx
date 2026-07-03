const APP_ICON = '/icon-192.png'

export function BrandMark({size = 32, className = 'brand-mark'}: {size?: number; className?: string}) {
  return (
    <img
      className={className}
      src={APP_ICON}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  )
}
