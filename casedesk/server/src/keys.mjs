// Normalised employer key so "HCL America, Inc." and "HCL AMERICA INC" match.
export const keyOf = (name) => String(name).toUpperCase().replace(/&/g, ' AND ').replace(/[^A-Z0-9 ]/g, ' ')
  .replace(/\b(INCORPORATED|INC|LLC|L L C|LTD|LIMITED|CORP|CORPORATION|CO|COMPANY|LP|LLP|PLLC|PC|THE)\b/g, ' ').replace(/\s+/g, ' ').trim();
