const keep = await ev(`draft.roads['Bordeaux']`);
ok('kept segment read by its key', !!keep);
