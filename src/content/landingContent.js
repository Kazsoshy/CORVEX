/**
 * Public landing-page copy and product selection.
 * Edit this file to change company text, contact details, and showcased products.
 * Product notes describe the photographs already in the project. Replace them
 * when official product information is available.
 */
import ariaSectional from '../assets/products-image/aria-sectional.jpg';
import boardroomTable from '../assets/products-image/boardroom-table.jpg';
import auraWardrobe from '../assets/products-image/aura-wardrobe.png';
import cedarRecliner from '../assets/products-image/cedar-recliner.jpg';
import breezewayPatio from '../assets/products-image/breezeway-patio-set.jpg';
import baristaStool from '../assets/products-image/barista-stool.jpg';

export const landingContent = {
  brand: 'CORVEX',
  legalName: 'CORVEX Furniture',
  email: 'ops@corvex.ph',
  /** Existing staff and customer authentication. Do not point this elsewhere. */
  signInPath: '/login',

  nav: [
    { id: 'home', label: 'Home', href: '#home' },
    { id: 'about', label: 'About Us', href: '#about' },
    { id: 'products', label: 'Our Products', href: '#products' },
    { id: 'contact', label: 'Contact', href: '#contact' },
  ],

  hero: {
    kicker: 'CORVEX Furniture',
    titleLead: 'Furniture for',
    titleEmphasis: 'daily life.',
    lede: 'A collection for living, sleeping, dining, work, and the outdoors — kept in view across every CORVEX branch.',
    primaryCta: { label: 'Our Products', href: '#products' },
    secondaryCta: { label: 'Get in Touch', href: '#contact' },
  },

  about: {
    kicker: '01 — About Us',
    title: 'Built around the collection.',
    intro:
      'CORVEX is a furniture company. The collection covers living rooms, bedrooms, dining, offices, and outdoor spaces. Staff and customers use the same CORVEX account to follow inventory, orders, and service across branches.',
    mission: {
      label: 'Mission',
      text: 'To present the collection clearly, and to keep it available with the same care at every branch.',
    },
    vision: {
      label: 'Vision',
      text: 'A company where the showroom, the warehouse, and the customer account share one picture of the collection.',
    },
  },

  values: [
    {
      id: 'innovation',
      name: 'Innovation',
      text: 'We keep looking for clearer ways to design, present, and run the collection.',
    },
    {
      id: 'quality',
      name: 'Quality',
      text: 'Pieces are chosen and shown with attention to material, finish, and how they sit in a room.',
    },
    {
      id: 'reliability',
      name: 'Reliability',
      text: 'What we say is available should be what staff and customers can count on.',
    },
    {
      id: 'commitment',
      name: 'Customer commitment',
      text: 'The relationship continues after a piece is chosen, through the people and the account that support it.',
    },
  ],

  productsIntro: {
    kicker: '02 — Our Products',
    title: 'A selection from the collection.',
    lede: 'Living, work, bedroom, and outdoor pieces. Choose Learn More to bring a piece forward.',
  },

  products: [
    {
      id: 'aria-sectional',
      name: 'Aria Sectional',
      category: 'Living Room',
      summary: 'Chaise sectional with upholstered seating and a dark wood frame.',
      note: 'Three seat cushions, loose back cushions, and a chaise on a low wood base.',
      image: ariaSectional,
      fit: 'contain',
      stage: '#f4f4f4',
    },
    {
      id: 'boardroom-table',
      name: 'Boardroom Table',
      category: 'Office',
      summary: 'A wood meeting table shown with a surrounding set of chairs.',
      note: 'A long wood top with a dark center inlay, set on a metal frame.',
      image: boardroomTable,
      fit: 'contain',
      stage: '#f7f7f7',
    },
    {
      id: 'aura-wardrobe',
      name: 'Aura Wardrobe',
      category: 'Bedroom',
      summary: 'A fitted wardrobe with hanging space, shelves, and drawers.',
      note: 'White cabinetry arranged as hanging rods, open shelves, and a bank of drawers.',
      image: auraWardrobe,
      fit: 'cover',
      stage: '#ece7e1',
    },
    {
      id: 'cedar-recliner',
      name: 'Cedar Recliner',
      category: 'Living Room',
      summary: 'A tan recliner shown with the footrest extended.',
      note: 'Upholstered chair with a high back, wide arms, and a visible recline mechanism.',
      image: cedarRecliner,
      fit: 'contain',
      stage: '#f3f3f3',
    },
    {
      id: 'breezeway-patio-set',
      name: 'Breezeway Patio Set',
      category: 'Outdoor',
      summary: 'Four outdoor armchairs arranged around a round table.',
      note: 'Dark woven chairs with wood legs and cushions, gathered around a circular top.',
      image: breezewayPatio,
      fit: 'contain',
      stage: '#f7f7f7',
    },
    {
      id: 'barista-stool',
      name: 'Barista Stool',
      category: 'Dining',
      summary: 'Wood bar stools with a curved back and an upholstered seat.',
      note: 'A wood frame with a footrest and a light fabric seat.',
      image: baristaStool,
      fit: 'contain',
      stage: '#d7d7d7',
    },
  ],

  valuesIntro: {
    kicker: '03 — Values',
    title: 'Four things we hold to.',
    lede: 'Innovation, quality, reliability, and a commitment to the customer.',
  },

  contact: {
    kicker: '04 — Contact',
    title: 'Begin with a note.',
    lede: 'Questions about a piece, a branch, or an account can come here. Staff and customers who already have access can sign in.',
    signInLabel: 'Sign in to your account',
    formTitle: 'Write to CORVEX',
    formNote: 'Sending opens your email app with this message addressed to us.',
    submitLabel: 'Send message',
  },

  footer: {
    blurb: 'Furniture for homes and workplaces.',
  },
};
