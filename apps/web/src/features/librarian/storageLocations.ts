const shelves = 'ABCDEFGHIJKL'.split('');

export const STORAGE_LOCATIONS = [
  'Tầng trệt',
  'Tầng 1',
  'Tầng 2',
  'Tầng 3',
].flatMap((floor) => shelves.map((shelf) => `${floor} · Kệ ${shelf}`));
