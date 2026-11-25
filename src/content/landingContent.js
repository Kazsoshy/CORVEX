/**
 * Public landing-page copy and product selection.
 * Edit this file to change company text, contact details, and showcased products.
 * Product notes describe the photographs already in the project. Replace them
 * when official product information is available.
 */
import boundPocketMattress from '../assets/product-images/Bound-pocket-mattress.png';
import ceramicGingerJar from '../assets/product-images/Ceramic-ginger-jar.png';
import foldingMattress from '../assets/product-images/Folding-mattress.png';
import monoblockChair from '../assets/product-images/Monoblock-Chair.png';
import squareTable from '../assets/product-images/Square-Table.png';
import uratexClassicMattress from '../assets/product-images/Uratex-Classic-Mattress.png';
import uratexKateChair from '../assets/product-images/Uratex-Monoblock-kate-chair.png';
import uratexZoePlasticWare from '../assets/product-images/Uratex-Zoe-plastic-ware.png';
import zooeyDishCabinet from '../assets/product-images/Zooey-Master-Deluxe-Dish-Cabinet.png';
import zooeyRattanSalaSet from '../assets/product-images/Zooey-rattan-sala-set.png';

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
    titleLead: 'Make Every Space',
    titleEmphasis: 'Feel Like Home.',
    lede: 'A collection for living, sleeping, dining, work, and the outdoors — kept in view across every BH Marketing branch.',
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
      id: 'zooey-rattan-sala-set',
      name: 'Zooey Rattan Sala Set',
      category: 'Living Room',
      summary: 'Complete living room suite featuring woven armchairs, sofa, and a matching coffee table.',
      note: 'Durable weather-resistant woven rattan finish with ergonomic seating.',
      image: zooeyRattanSalaSet,
      fit: 'contain',
      stage: 'var(--surface-2)',
    },
    {
      id: 'uratex-classic-mattress',
      name: 'Uratex Classic Mattress',
      category: 'Bedroom',
      summary: 'High-density foam mattress providing reliable comfort and medium-firm body support.',
      note: 'Long-lasting polyurethane foam core with premium jacquard fabric upholstery.',
      image: uratexClassicMattress,
      fit: 'contain',
      stage: 'var(--surface-2)',
    },
    {
      id: 'square-table',
      name: 'Square Dining Table',
      category: 'Dining',
      summary: 'Sturdy four-legged utility dining table with a smooth, easy-to-clean surface.',
      note: 'Reinforced polymer structure designed for versatile indoor and outdoor use.',
      image: squareTable,
      fit: 'contain',
      stage: 'var(--surface-2)',
    },
    {
      id: 'zooey-dish-cabinet',
      name: 'Zooey Master Deluxe Dish Cabinet',
      category: 'Kitchen & Dining',
      summary: 'Multi-tier enclosed kitchen storage with clear doors and ventilated compartments.',
      note: 'Includes integrated plate organizers, glass racks, and pull-out drawers.',
      image: zooeyDishCabinet,
      fit: 'contain',
      stage: 'var(--surface-2)',
    },
    {
      id: 'uratex-kate-chair',
      name: 'Uratex Kate Monoblock Armchair',
      category: 'Living & Dining',
      summary: 'Ergonomic molded armchair with curved back support and integrated armrests.',
      note: 'Heavy-duty resin construction with a sleek matte finish, easily stackable.',
      image: uratexKateChair,
      fit: 'contain',
      stage: 'var(--surface-2)',
    },
    {
      id: 'bound-pocket-mattress',
      name: 'Bound Pocket Spring Mattress',
      category: 'Bedroom',
      summary: 'Individual pocket springs designed to isolate motion and provide targeted pressure relief.',
      note: 'Multi-layer construction with a quilted breathable fabric top layer.',
      image: boundPocketMattress,
      fit: 'contain',
      stage: 'var(--surface-2)',
    },
    {
      id: 'folding-mattress',
      name: 'Fold-A-Mattress',
      category: 'Bedroom',
      summary: 'Space-saving tri-fold portable mattress ideal for compact living and guests.',
      note: 'High-density flexible foam that folds neatly for storage and transport.',
      image: foldingMattress,
      fit: 'contain',
      stage: 'var(--surface-2)',
    },
    {
      id: 'monoblock-chair',
      name: 'Classic Monoblock Chair',
      category: 'Dining & Outdoor',
      summary: 'All-weather, lightweight molded chair built for daily residential and commercial use.',
      note: 'UV-resistant polymer with reinforced ribbing for durable daily use.',
      image: monoblockChair,
      fit: 'contain',
      stage: 'var(--surface-2)',
    },
    {
      id: 'uratex-zoe-plastic-ware',
      name: 'Zoe Storage Chest',
      category: 'Storage',
      summary: 'Multi-layer organizer chest with spacious smooth-glide drawers.',
      note: 'Durable modular storage solution for clothing, linens, and household essentials.',
      image: uratexZoePlasticWare,
      fit: 'contain',
      stage: 'var(--surface-2)',
    },
    {
      id: 'ceramic-ginger-jar',
      name: 'Ceramic Ginger Jar',
      category: 'Home Decor',
      summary: 'Handcrafted decorative ceramic accent piece with delicate glaze detailing.',
      note: 'Classic urn silhouette with a fitted lid, ideal for tabletop display.',
      image: ceramicGingerJar,
      fit: 'contain',
      stage: 'var(--surface-2)',
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
