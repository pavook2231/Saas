import { ImageResponse } from 'next/og';

export const size = {
  width: 180,
  height: 180,
};

export const contentType = 'image/png';

function AppleTheatreCalendarHierarchyArtwork() {
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
      <svg width="180" height="180" viewBox="0 0 180 180" fill="none">
        <defs>
          <linearGradient id="bg" x1="26" y1="18" x2="154" y2="162" gradientUnits="userSpaceOnUse">
            <stop stopColor="#1f3b64" />
            <stop offset="1" stopColor="#0e1728" />
          </linearGradient>
          <linearGradient id="card" x1="42" y1="38" x2="140" y2="146" gradientUnits="userSpaceOnUse">
            <stop stopColor="#fffdfa" />
            <stop offset="1" stopColor="#eef4fb" />
          </linearGradient>
          <linearGradient id="top" x1="42" y1="38" x2="138" y2="72" gradientUnits="userSpaceOnUse">
            <stop stopColor="#2b5f9d" />
            <stop offset="1" stopColor="#183f72" />
          </linearGradient>
          <linearGradient id="perf" x1="56" y1="86" x2="124" y2="96" gradientUnits="userSpaceOnUse">
            <stop stopColor="#ffb178" />
            <stop offset="1" stopColor="#ff8a4c" />
          </linearGradient>
          <linearGradient id="rehearsal" x1="56" y1="108" x2="124" y2="118" gradientUnits="userSpaceOnUse">
            <stop stopColor="#8fe0ae" />
            <stop offset="1" stopColor="#4abb74" />
          </linearGradient>
          <linearGradient id="tour" x1="56" y1="130" x2="124" y2="140" gradientUnits="userSpaceOnUse">
            <stop stopColor="#98c6ff" />
            <stop offset="1" stopColor="#5d92f3" />
          </linearGradient>
        </defs>

        <rect x="0" y="0" width="180" height="180" rx="40" fill="url(#bg)" />
        <rect x="0.5" y="0.5" width="179" height="179" rx="39.5" stroke="rgba(255,255,255,0.12)" />

        <rect x="40" y="38" width="100" height="106" rx="18" fill="url(#card)" />
        <rect x="40" y="38" width="100" height="30" rx="18" fill="url(#top)" />
        <rect x="40" y="52" width="100" height="16" fill="url(#top)" />
        <rect x="40.5" y="38.5" width="99" height="105" rx="17.5" stroke="rgba(255,255,255,0.22)" />

        <rect x="58" y="28" width="10" height="20" rx="5" fill="#dbeafe" />
        <rect x="112" y="28" width="10" height="20" rx="5" fill="#dbeafe" />
        <rect x="54" y="32" width="18" height="6" rx="3" fill="#ffffff" fillOpacity="0.8" />
        <rect x="108" y="32" width="18" height="6" rx="3" fill="#ffffff" fillOpacity="0.8" />

        <circle cx="56" cy="48" r="4" fill="#ffffff" fillOpacity="0.84" />
        <rect x="66" y="44" width="48" height="8" rx="4" fill="#ffffff" fillOpacity="0.78" />
        <rect x="118" y="44" width="10" height="8" rx="4" fill="#dbeafe" />

        <rect x="54" y="82" width="72" height="14" rx="7" fill="url(#perf)" />
        <circle cx="62" cy="89" r="3" fill="#ffffff" fillOpacity="0.92" />
        <rect x="68" y="86" width="28" height="6" rx="3" fill="#ffffff" fillOpacity="0.86" />
        <rect x="100" y="86" width="18" height="6" rx="3" fill="#ffffff" fillOpacity="0.56" />

        <rect x="54" y="104" width="72" height="14" rx="7" fill="url(#rehearsal)" />
        <circle cx="62" cy="111" r="3" fill="#ffffff" fillOpacity="0.92" />
        <rect x="68" y="108" width="34" height="6" rx="3" fill="#ffffff" fillOpacity="0.86" />
        <rect x="106" y="108" width="12" height="6" rx="3" fill="#ffffff" fillOpacity="0.56" />

        <rect x="54" y="126" width="72" height="14" rx="7" fill="url(#tour)" />
        <circle cx="62" cy="133" r="3" fill="#ffffff" fillOpacity="0.92" />
        <rect x="68" y="130" width="24" height="6" rx="3" fill="#ffffff" fillOpacity="0.86" />
        <rect x="96" y="130" width="22" height="6" rx="3" fill="#ffffff" fillOpacity="0.56" />
      </svg>
    </div>
  );
}

export default function AppleIcon() {
  return new ImageResponse(<AppleTheatreCalendarHierarchyArtwork />, size);
}
