# Contribuer

Les corrections méthodologiques, cas limites et tests de non-régression sont les
bienvenus. Toute modification qui change un résultat doit :

1. expliquer le problème statistique ou la donnée amont concernée ;
2. ajouter ou adapter un test ;
3. mettre à jour `METHODOLOGIE.md` ;
4. signaler clairement si le changement est rétroactif.

Une exclusion ponctuelle de sondage est un dernier recours. Elle doit être
justifiée dans le code et, lorsque possible, signalée au dépôt source
`MieuxVoter/presidentielle2027`.

Avant de proposer un changement :

```bash
yarn check
```
