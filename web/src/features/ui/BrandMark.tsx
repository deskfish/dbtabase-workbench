export function BrandMark({size = 32, className = 'brand-mark'}: {size?: number; className?: string}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      shapeRendering="geometricPrecision"
    >
      <defs>
        <linearGradient id="dbw-bg" x1="96" y1="64" x2="416" y2="448" gradientUnits="userSpaceOnUse">
          <stop stopColor="#24b8ad"/>
          <stop offset="1" stopColor="#12857c"/>
        </linearGradient>
        <linearGradient id="dbw-shine" x1="128" y1="96" x2="320" y2="240" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fff" stopOpacity=".28"/>
          <stop offset="1" stopColor="#fff" stopOpacity="0"/>
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="112" fill="url(#dbw-bg)"/>
      <rect width="512" height="512" rx="112" fill="url(#dbw-shine)"/>
      <ellipse cx="256" cy="152" rx="136" ry="52" fill="#fff"/>
      <path fill="#fff" fillOpacity=".22" d="M120 152v168c0 28.8 60.8 52 136 52s136-23.2 136-52V152"/>
      <path stroke="#fff" strokeWidth="20" strokeLinecap="round" strokeLinejoin="round" d="M120 152v168c0 28.8 60.8 52 136 52s136-23.2 136-52V152"/>
      <ellipse cx="256" cy="232" rx="136" ry="52" stroke="#fff" strokeWidth="20"/>
      <ellipse cx="256" cy="312" rx="136" ry="52" stroke="#fff" strokeWidth="20"/>
    </svg>
  )
}
