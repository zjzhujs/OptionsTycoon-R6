import rawTerms from "../data/financial_terms.json";
import type { FinancialTerm } from "../schemas";

export function get_all_terms(): FinancialTerm[] {
  const data = rawTerms as { terms?: FinancialTerm[] };
  return [...(data.terms ?? [])];
}

export function find_term_by_id(term_id: string): FinancialTerm | null {
  return get_all_terms().find((term) => term.id === term_id) ?? null;
}

export function search_terms(keyword: string): FinancialTerm[] {
  const kw = keyword.toLowerCase();
  return get_all_terms().filter((term) => term.term_cn.toLowerCase().includes(kw) || term.term_en.toLowerCase().includes(kw) || term.short_def.toLowerCase().includes(kw) || term.category.toLowerCase().includes(kw));
}

