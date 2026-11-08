const stored = await ev(`localStorage.getItem('Shared label')`);
ok('stored value read by its key', stored !== null);
