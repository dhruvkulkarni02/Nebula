import React from 'react';

export default function IconAdd({ size = 36 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <rect x="2" y="2" width="44" height="44" rx="10" stroke="#8fbff7" strokeDasharray="4 4" strokeWidth="1.6" fill="rgba(255,255,255,0.02)" />
      <path d="M24 14v20M14 24h20" stroke="#8fbff7" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
