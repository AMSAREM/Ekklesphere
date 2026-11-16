import React from 'react';

export const LandingTrustStrip: React.FC = () => {
  return (
    <section
      aria-label="Ekklesphere trust signals"
      className="border-t border-[#d9d4ca] bg-[#f7f3ec]"
    >
      <div className="mx-auto flex max-w-[1360px] flex-col gap-6 px-5 py-8 sm:px-8 lg:flex-row lg:items-center lg:gap-14 lg:px-14 lg:py-10">
        <p className="whitespace-nowrap text-xs text-[#6e7777]">
          Trusted by teams building <strong className="text-[#0b1f33]">healthier churches</strong>
        </p>

        <div className="grid w-full grid-cols-2 items-center gap-6 text-[#78827e] sm:grid-cols-3 lg:flex lg:justify-between">
          <div className="text-center lg:text-left">
            <span className="block text-xs font-bold tracking-[0.14em]">NEW CITY</span>
            <span className="block text-[8px] font-semibold tracking-[0.22em]">CHURCH</span>
          </div>
          <div className="font-display text-2xl italic tracking-tight text-center lg:text-left">
            harbor
          </div>
          <div className="text-center lg:text-left">
            <span className="block text-xs font-bold tracking-[0.14em]">ARC</span>
            <span className="block text-[8px] font-semibold tracking-[0.22em]">CHURCHES</span>
          </div>
          <div className="font-display text-xl italic text-center lg:text-left">the gathering</div>
          <div className="col-span-2 text-center sm:col-span-1 lg:text-left">
            <span className="text-xs font-bold tracking-[0.12em]">COMMON</span>
          </div>
        </div>
      </div>
    </section>
  );
};
