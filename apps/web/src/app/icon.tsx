import { ImageResponse } from 'next/og';

export const size = {
  width: 512,
  height: 512,
};

export const contentType = 'image/png';

function TheatreCalendarHierarchyArtwork() {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#14233b',
      }}
    >
      <svg width="512" height="512" viewBox="0 0 512 512" fill="none">
        <defs>
          <linearGradient id="bg" x1="86" y1="60" x2="430" y2="450" gradientUnits="userSpaceOnUse">
            <stop stopColor="#1f3b64" />
            <stop offset="1" stopColor="#0e1728" />
          </linearGradient>
          <linearGradient id="card" x1="118" y1="110" x2="396" y2="404" gradientUnits="userSpaceOnUse">
            <stop stopColor="#fffdfa" />
            <stop offset="1" stopColor="#eef4fb" />
          </linearGradient>
          <linearGradient id="top" x1="118" y1="110" x2="394" y2="202" gradientUnits="userSpaceOnUse">
            <stop stopColor="#2b5f9d" />
            <stop offset="1" stopColor="#183f72" />
          </linearGradient>
          <linearGradient id="perf" x1="154" y1="236" x2="348" y2="266" gradientUnits="userSpaceOnUse">
            <stop stopColor="#ffb178" />
            <stop offset="1" stopColor="#ff8a4c" />
          </linearGradient>
          <linearGradient id="rehearsal" x1="154" y1="302" x2="348" y2="332" gradientUnits="userSpaceOnUse">
            <stop stopColor="#8fe0ae" />
            <stop offset="1" stopColor="#4abb74" />
          </linearGradient>
          <linearGradient id="tour" x1="154" y1="368" x2="348" y2="398" gradientUnits="userSpaceOnUse">
            <stop stopColor="#98c6ff" />
            <stop offset="1" stopColor="#5d92f3" />
          </linearGradient>
          <filter id="shadow" x="90" y="78" width="332" height="364" filterUnits="userSpaceOnUse">
            <feOffset dy="18" />
            <feGaussianBlur stdDeviation="14" />
            <feColorMatrix
              type="matrix"
              values="0 0 0 0 0.0392 0 0 0 0 0.0784 0 0 0 0 0.1451 0 0 0 0.28 0"
            />
            <feBlend in2="SourceGraphic" result="shape" />
          </filter>
        </defs>

        <rect x="0" y="0" width="512" height="512" rx="116" fill="url(#bg)" />
        <rect x="0.5" y="0.5" width="511" height="511" rx="115.5" stroke="rgba(255,255,255,0.1)" />

        <g filter="url(#shadow)">
          <rect x="116" y="108" width="280" height="300" rx="44" fill="url(#card)" />
          <rect x="116" y="108" width="280" height="92" rx="44" fill="url(#top)" />
          <rect x="116" y="156" width="280" height="44" fill="url(#top)" />
          <rect x="116.75" y="108.75" width="278.5" height="298.5" rx="43.25" stroke="rgba(255,255,255,0.22)" />

          <rect x="168" y="82" width="28" height="62" rx="14" fill="#dbeafe" />
          <rect x="316" y="82" width="28" height="62" rx="14" fill="#dbeafe" />
          <rect x="160" y="94" width="44" height="18" rx="9" fill="#ffffff" fillOpacity="0.8" />
          <rect x="308" y="94" width="44" height="18" rx="9" fill="#ffffff" fillOpacity="0.8" />

          <circle cx="162" cy="138" r="10" fill="#ffffff" fillOpacity="0.82" />
          <rect x="184" y="129" width="146" height="18" rx="9" fill="#ffffff" fillOpacity="0.8" />
          <rect x="338" y="129" width="30" height="18" rx="9" fill="#dbeafe" />

          <rect x="152" y="228" width="208" height="38" rx="19" fill="url(#perf)" />
          <circle cx="176" cy="247" r="8" fill="#ffffff" fillOpacity="0.95" />
          <rect x="192" y="240" width="88" height="14" rx="7" fill="#ffffff" fillOpacity="0.86" />
          <rect x="290" y="240" width="46" height="14" rx="7" fill="#ffffff" fillOpacity="0.56" />

          <rect x="152" y="294" width="208" height="38" rx="19" fill="url(#rehearsal)" />
          <circle cx="176" cy="313" r="8" fill="#ffffff" fillOpacity="0.95" />
          <rect x="192" y="306" width="104" height="14" rx="7" fill="#ffffff" fillOpacity="0.86" />
          <rect x="306" y="306" width="30" height="14" rx="7" fill="#ffffff" fillOpacity="0.56" />

          <rect x="152" y="360" width="208" height="38" rx="19" fill="url(#tour)" />
          <circle cx="176" cy="379" r="8" fill="#ffffff" fillOpacity="0.95" />
          <rect x="192" y="372" width="76" height="14" rx="7" fill="#ffffff" fillOpacity="0.86" />
          <rect x="278" y="372" width="58" height="14" rx="7" fill="#ffffff" fillOpacity="0.56" />
        </g>
      </svg>
    </div>
  );
}

export default function Icon() {
  return new ImageResponse(<TheatreCalendarHierarchyArtwork />, size);
}
