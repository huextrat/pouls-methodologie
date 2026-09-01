# Méthodologie d’agrégation

## Objectif

Pouls ne cherche pas à prédire un résultat électoral. Le moteur résume des
sondages déjà publiés avec des règles simples, publiques et identiques pour
tous les candidats.

Un flux de sondages ne contient pas une seule mesure par enquête : un institut
peut publier plusieurs hypothèses avec des listes de candidats différentes.
Compter chaque hypothèse comme une enquête surpondérerait les instituts qui en
publient le plus.

## Entrée et validation

Le schéma attendu correspond au flux JSON de
`MieuxVoter/presidentielle2027`. Les champs nécessaires sont validés avec Zod.
Si le schéma devient incompatible, le calcul échoue au lieu de publier un
résultat partiel ou silencieusement altéré.

Les champs supplémentaires sont tolérés pour rester compatible avec les ajouts
non cassants de la source.

## Agrégat du premier tour

### 1. Fenêtre glissante adaptative

La date de référence est la date de fin du terrain (`fin_enquete`). Le moteur
essaie une fenêtre de 30 jours. Si elle contient moins de cinq sondages
distincts, il essaie 45 jours, puis 60 jours.

Une enquête dont la fin de terrain se situe dans le futur par rapport à la date
de calcul n’est jamais incluse.

### 2. Déduplication des hypothèses

Les enregistrements partageant le même institut, la même date de début et la
même date de fin de terrain forment une enquête distincte. Cette clé est
normalisée sous la forme :

```text
institut|debut_enquete|fin_enquete
```

Pour chaque enquête et chaque candidat, le moteur prend la moyenne arithmétique
des intentions publiées dans toutes les hypothèses où ce candidat apparaît.
Chaque enquête contribue donc au plus une valeur par candidat.

Cette règle corrige la surpondération des hypothèses, mais ne rend pas les
scénarios parfaitement comparables. Le score d’un candidat dépend aussi de la
liste de ses concurrents. Pouls assume cette moyenne inter-hypothèses plutôt que
de choisir une liste « officielle » qui constituerait un arbitrage éditorial.

### 3. Pondération d’une enquête

Le poids est le produit de deux termes :

```text
poids = exp(-age_jours / 14) × √(echantillon / 1000)
```

- La récence décroît exponentiellement. Une enquête vieille de 14 jours reçoit
  environ 37 % du poids de récence d’une enquête du jour.
- Le poids lié à l’échantillon croît avec sa racine carrée, cohérent avec une
  erreur d’échantillonnage qui décroît en `1/√n`.

Le poids d’échantillon n’est pas plafonné dans la version actuelle. Une enquête
sur une sous-population ne doit donc pas entrer dans le flux national ; les cas
amont mal étiquetés sont traités par la liste publique d’exclusions.

### 4. Moyenne pondérée par candidat

Pour un candidat `c` :

```text
score_c = Σ poids_p × valeur_pc / Σ poids_p
```

La somme porte uniquement sur les enquêtes de la fenêtre où le candidat est
présent. Le résultat final est arrondi à un chiffre après la virgule.

### 5. Marge affichée

La marge est celle d’un sondage typique :

```text
N_moyen = moyenne des tailles d’échantillon des enquêtes contenant le candidat
marge = 1,96 × √(p × (1-p) / N_moyen) × 100
```

avec `p = score / 100`.

Les tailles d’échantillon ne sont pas additionnées. Une marge calculée avec
l’échantillon total donnerait une impression de précision excessive et
n’intégrerait toujours pas les effets de méthode ou d’institut. La marge
affichée n’est donc pas un intervalle de confiance complet de l’agrégat : c’est
un repère pédagogique prudent, proche de l’incertitude publiée pour un sondage
individuel.

### 6. Tendance

Le score courant est comparé au score calculé sur la fenêtre immédiatement
précédente, de même largeur :

```text
delta = score_courant - score_precedent
```

- `delta > marge` : hausse ;
- `delta < -marge` : baisse ;
- sinon : stable.

Sans score dans la fenêtre précédente, la tendance est stable.

### 7. Candidats affichés

Un candidat est conservé uniquement si :

- sa date de retrait est vide ou postérieure à la date du calcul ;
- il apparaît dans au moins 40 % des enquêtes distinctes de la fenêtre.

Les candidats restants sont triés par score décroissant.

## Courbe de tendance

Chaque point historique répond à la question : « qu’aurait affiché l’agrégat à
cette date ? » Le moteur réexécute donc le même calcul glissant à chaque relevé.

Les buckets de 14 jours déterminent seulement la cadence des points et le
nombre de nouvelles enquêtes affiché sous le graphe. Ils ne remplacent jamais
la fenêtre d’agrégation de 30, 45 ou 60 jours.

La grille est ancrée sur le 18 avril 2027, date du premier tour, afin que les
dates historiques ne glissent pas d’un build à l’autre. Le dernier point est
borné à la date du dernier sondage inclus et son score est strictement égal à
l’agrégat courant.

## Duels de second tour

Les enregistrements `tour = "2nd Tour"` contenant exactement deux candidats
sont des face-à-face mesurés, pas des simulations.

Les doublons d’hypothèses d’une même paire, d’un même institut et d’un même
terrain sont d’abord moyennés. Les duels sont ensuite pondérés avec la même
formule de récence et d’échantillon que le premier tour.

Comme ils sont plus rares, le moteur essaie des fenêtres de 120, 240 puis 540
jours. La version actuelle ignore les terrains antérieurs au 1er juillet 2026,
considérés comme appartenant à un paysage politique devenu trop ancien.

Cette date est un paramètre public du moteur. Aucun coefficient de report de
voix n’est calculé ou imposé.

## Exclusions publiques

La liste `EXCLUDED_POLL_IDS` est appliquée avant toute exploitation. Elle est un
dernier recours lorsque la donnée amont est erronée et qu’aucune règle générale
ne peut détecter le problème.

Exclusion actuelle :

- `20260201_0206_if_A` — enquête IFOP × Têtu menée auprès des électeurs LGBT+,
  mais décrite comme représentative de la population française dans le flux
  amont. L’inclure dans une moyenne nationale, avec son échantillon de 10 196
  personnes, déformerait fortement le résultat.

Chaque ajout doit être justifié dans le code et signalé à la source lorsque
possible.

## Limites et non-objectifs

- Pas de correction des effets de maison par institut.
- Pas de modèle bayésien ni de projection électorale.
- Pas de sélection d’une hypothèse canonique.
- Pas de correction pour les modes de recueil ou les indécis au-delà des
  données publiées.
- Pas de simulation automatique des reports de voix.
- La marge affichée ne capture pas toute l’incertitude méthodologique.

Ces limites sont intentionnelles : Pouls privilégie une méthode compréhensible,
auditable et politiquement neutre à un modèle plus opaque.
