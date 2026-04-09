import { ImageResponse } from 'next/og';

export const size = {
  width: 180,
  height: 180,
};

export const contentType = 'image/png';

function AppleIconArtwork() {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#16243d',
      }}
    >
      <div
        style={{
          position: 'relative',
          display: 'flex',
          width: 122,
          height: 138,
          borderRadius: 18,
          background: '#fff8ec',
          border: '3px solid rgba(243, 211, 138, 0.32)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: '0 0 auto 0',
            height: 30,
            background: '#b33a4a',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: 8,
            left: 24,
            width: 10,
            height: 10,
            borderRadius: 999,
            background: '#f3d38a',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: 8,
            right: 24,
            width: 10,
            height: 10,
            borderRadius: 999,
            background: '#f3d38a',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: 44,
            left: 14,
            right: 14,
            bottom: 14,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 5,
          }}
        >
          {Array.from({ length: 9 }).map((_, index) => (
            <div
              key={index}
              style={{
                width: 28,
                height: index < 6 ? 28 : 17,
                borderRadius: 6,
                background: index === 4 ? '#dce6ff' : '#ffffff',
                border: `2px solid ${index === 4 ? '#2d63ea' : 'rgba(22, 36, 61, 0.10)'}`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function AppleIcon() {
  return new ImageResponse(<AppleIconArtwork />, size);
}
