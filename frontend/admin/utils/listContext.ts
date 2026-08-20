export const adminListContexts = {
  reservations: {
    path: '/admin/reservations',
    storageKey: 'admin-reservations-context',
    params: ['status', 'roomId', 'fromDate', 'toDate', 'keyword', 'page'],
  },
  recurrences: {
    path: '/admin/recurrences',
    storageKey: 'admin-recurrences-context',
    params: ['roomId', 'fromDate', 'toDate', 'keyword', 'page'],
  },
  rooms: {
    path: '/admin/rooms',
    storageKey: 'admin-rooms-context',
    params: ['keyword', 'page'],
  },
  audit: {
    path: '/admin/audit',
    storageKey: 'admin-audit-context',
    params: ['reservationId', 'roomId', 'action', 'fromDate', 'toDate', 'page'],
  },
} as const;

export type AdminListContext = keyof typeof adminListContexts;
export type AdminListSearches = Record<AdminListContext, string>;

function listSearch(context: AdminListContext, search: string) {
  const current = new URLSearchParams(search);
  const saved = new URLSearchParams();
  for (const name of adminListContexts[context].params) {
    const value = current.get(name);
    if (value) saved.set(name, value);
  }
  return saved.toString();
}

export function adminListContextForPath(pathname: string) {
  return (Object.keys(adminListContexts) as AdminListContext[])
    .find((context) => adminListContexts[context].path === pathname);
}

export function readAdminListSearch(context: AdminListContext) {
  try {
    return listSearch(
      context,
      window.sessionStorage.getItem(adminListContexts[context].storageKey) || '',
    );
  } catch {
    return '';
  }
}

export function readAdminListSearches(): AdminListSearches {
  return {
    reservations: readAdminListSearch('reservations'),
    recurrences: readAdminListSearch('recurrences'),
    rooms: readAdminListSearch('rooms'),
    audit: readAdminListSearch('audit'),
  };
}

export function saveAdminListSearch(context: AdminListContext, search: string) {
  const saved = listSearch(context, search);
  try {
    window.sessionStorage.setItem(adminListContexts[context].storageKey, saved);
    return saved;
  } catch {
    return '';
  }
}

export function adminListPath(context: AdminListContext) {
  const { path } = adminListContexts[context];
  const search = readAdminListSearch(context);
  return search ? `${path}?${search}` : path;
}

export function clearAdminListSearches() {
  for (const context of Object.keys(adminListContexts) as AdminListContext[]) {
    try {
      window.sessionStorage.removeItem(adminListContexts[context].storageKey);
    } catch {
      // Bare list routes remain available when storage is blocked.
    }
  }
}
