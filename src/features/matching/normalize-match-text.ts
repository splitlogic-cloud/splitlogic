function stripAccents(input: string): string {
    return input.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }
  
  function removeBracketedNoise(input: string): string {
    return input
      .replace(/\((.*?)\)/g, " ")
      .replace(/\[(.*?)\]/g, " ");
  }
  
  function removeFeaturing(input: string): string {
    return input
      .replace(/\bfeat\b\.?/gi, " ")
      .replace(/\bft\b\.?/gi, " ")
      .replace(/\bfeaturing\b/gi, " ");
  }
  
  export function normalizeMatchText(input: string | null | undefined): string | null {
    if (!input) return null;
  
    const value = stripAccents(input)
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  
    const noBrackets = removeBracketedNoise(value);
    const noFeat = removeFeaturing(noBrackets)
      .replace(/\s+/g, " ")
      .trim();
  
    return noFeat || null;
  }