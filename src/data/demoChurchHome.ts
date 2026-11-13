// src/data/demoChurchHome.ts
// Neutral fallback template for the multi-tenant public church Home screen
// when no published organisation profile is configured in Supabase yet.

import LandingImages from '../assets/images';
import type { Church } from '../types/churchHome';

export const DEMO_CHURCH_HOME: Church = {
  id: '',
  slug: '',
  name: 'Ekklesphere Sanctuary',
  shortName: 'Ekklesphere',
  tagline: 'Welcome to our church community',
  heroHeadline: 'Find a warm place to belong, worship, and grow together.',
  heroSubheadline:
    'Join us this week in person or online as we gather around scripture, prayer, and practical care for every neighbour.',
  missionHeading: 'Walking with God and our community every day of the week.',
  missionStatement:
    'We exist to nurture rooted disciples, build welcoming tables across generations, and serve families throughout our city with generosity and hope.',
  missionHighlights: [
    {
      title: 'Grounded teaching',
      detail: 'Weekly scripture exposition and midweek reflection circles open to lifelong believers and honest seekers alike.',
    },
    {
      title: 'Shared tables',
      detail: 'Neighbourhood fellowships meeting in local homes throughout the week.',
    },
    {
      title: 'Mercy in action',
      detail: 'Community support, hospital visitation teams, and youth mentorship running throughout the year.',
    },
  ],
  address: 'Main Sanctuary Campus',
  city: 'Accra, Ghana',
  phone: '',
  email: 'contact@ekklesphere.church',
  mapQuery: 'Accra, Ghana',
  mapUrl: 'https://www.google.com/maps/search/?api=1&query=Accra+Ghana',
  livestreamUrl: '#watch-sanctuary',
  timezone: 'Africa/Accra',
  socialLinks: {},
  theme: {
    brand: '#D97706',
    deep: '#102A22',
    bg: '#FAF8F4',
    text: '#16221D',
    darkBrand: '#F59E0B',
    darkDeep: '#0B1D17',
    darkBg: '#0E1714',
    darkText: '#F1F5F2',
  },
  serviceTimes: [
    {
      id: 'svc-sun-early',
      dayOfWeek: 0,
      label: 'First Sunday celebration',
      time: '07:30',
      durationMinutes: 105,
      campus: 'Main Sanctuary',
      description: 'Reflective choral worship, communion on first Sundays, and verse-by-verse teaching.',
      isLivestreamed: true,
    },
    {
      id: 'svc-sun-family',
      dayOfWeek: 0,
      label: 'Family & youth gathering',
      time: '10:00',
      durationMinutes: 120,
      campus: 'Main Sanctuary & Kids Hall',
      description: 'Congregational praise with dedicated age-graded classes for children and teens.',
      isLivestreamed: true,
    },
    {
      id: 'svc-wed-teaching',
      dayOfWeek: 3,
      label: 'Midweek word & prayer',
      time: '18:30',
      durationMinutes: 90,
      campus: 'Chapel Hall & Livestream',
      description: 'Interactive Bible study followed by unhurried prayer for families and the city.',
      isLivestreamed: true,
    },
    {
      id: 'svc-fri-prayer',
      dayOfWeek: 5,
      label: 'Evening watch & intercession',
      time: '18:00',
      durationMinutes: 90,
      campus: 'Upper Room Prayer Suite',
      description: 'Acoustic worship, scripture prayers, and pastoral anointing for the sick.',
      isLivestreamed: false,
    },
  ],
  ministries: [
    {
      id: 'min-belong',
      name: 'House fellowships',
      category: 'Belong & grow',
      summary: 'Weekly home circles sharing fellowship, prayer, and Sunday follow-up conversation.',
      meetingCadence: 'Midweek evenings',
      leaderName: 'Small Groups Ministry',
      imageUrl: LandingImages.churchHeroGathering,
      accentGradient: 'linear-gradient(135deg, #163C30 0%, #275E4B 60%, #D97706 145%)',
      linkHref: '#belong-grow',
    },
    {
      id: 'min-worship',
      name: 'Sanctuary choir & ensemble',
      category: 'Worship & music',
      summary: 'Vocalists, instrumentalists, and sound stewards preparing reverent worship for every gathering.',
      meetingCadence: 'Saturdays',
      leaderName: 'Worship Ministry',
      accentGradient: 'linear-gradient(135deg, #1B3831 0%, #2F6052 65%, #B45309 140%)',
      linkHref: '#worship-music',
    },
    {
      id: 'min-mission',
      name: 'Community outreach & care',
      category: 'Mission & serve',
      summary: 'Coordinating local outreach, food support, and community visits with local partners.',
      meetingCadence: 'Monthly outreach',
      leaderName: 'Outreach Team',
      accentGradient: 'linear-gradient(135deg, #213A2F 0%, #3E5C45 60%, #D97706 135%)',
      linkHref: '#mission-serve',
    },
  ],
  events: [
    {
      id: 'evt-city-table',
      title: 'Newcomers Sunday welcome & campus tour',
      dateIso: '2026-11-15T12:15:00Z',
      timeLabel: 'After morning service',
      location: 'Main Courtyard',
      category: 'Featured gathering',
      summary:
        'Visiting for the first time or settling in? Stay after service to meet our pastors and ministry leads.',
      imageUrl: LandingImages.churchHeroGathering,
      featured: true,
      registrationHref: '#visit-us',
    },
  ],
  newsPosts: [],
  isPublished: true,
};

export const DEMO_CHURCH_REGISTRY: Record<string, Church> = {};
