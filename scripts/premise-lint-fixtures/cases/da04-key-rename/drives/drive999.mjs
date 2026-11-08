const seg = await ev(`draft.roads['Bordeaux']`);
ok('draft segment read by its key', !!seg);
