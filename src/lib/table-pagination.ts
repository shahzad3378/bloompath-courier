export const tablePageSizes = [
  100,
  200,
  500,
  1000,
  5000,
] as const;

export type TableSearchParams = Record<
  string,
  string | undefined
>;

export function parseTablePagination(
  params: TableSearchParams,
) {
  const requestedSize = Number(params.page_size || 100);
  const pageSize = tablePageSizes.includes(
    requestedSize as (typeof tablePageSizes)[number],
  )
    ? requestedSize
    : 100;
  const requestedPage = Number(params.page || 1);
  const page =
    Number.isInteger(requestedPage) && requestedPage > 0
      ? requestedPage
      : 1;
  const from = (page - 1) * pageSize;

  return {
    page,
    pageSize,
    from,
    to: from + pageSize - 1,
  };
}

export function parseDateBoundary(
  value: string | undefined,
  endOfDay = false,
) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  return `${value}T${endOfDay ? "23:59:59.999" : "00:00:00"}+04:00`;
}
