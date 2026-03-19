# laboxnix.github.io

Application **To‑Do** statique déployée sur GitHub Pages.

URL: https://laboxnix.github.io/

## Usage

Aucune installation nécessaire :
1. Ouvrir l’application dans le navigateur.
2. Créer un compte local (username + mot de passe).
3. Ajouter, éditer, supprimer et filtrer les tâches.
4. Utiliser l’agenda (jour/semaine) pour planifier.
5. Exporter la vue courante en CSV via le menu.

## Stack

- HTML
- CSS
- JavaScript (vanilla, module ES)
- Stockage local navigateur (`localStorage`)

## Limites connues (mode local assumé)

Ce projet est volontairement **100% local** :
- Les comptes et tâches sont stockés dans `localStorage` du navigateur.
- Aucune synchronisation cloud / serveur.
- Les données sont liées au navigateur/profil en cours.
- Si le stockage local est effacé, les données sont perdues.
- Ce mécanisme d’authentification est pratique pour un usage local, **pas** pour des données sensibles en production.

## Tests minimaux (tri/filtre/date)

Des tests de base valident la logique métier essentielle :
- tri par date d’échéance,
- tri par priorité,
- filtres (all/active/completed),
- filtre agenda semaine,
- calcul de plage semaine (lundi → dimanche),
- normalisation de date.

Exécution :

```bash
node --test tests/*.test.mjs
```

## Roadmap

- [x] Sauvegarde complète avant refactor (`old/<timestamp>` + branche backup)
- [x] Nettoyage des fichiers temporaires `tmp_*`
- [x] README documenté
- [x] Tests minimaux tri/filtre/date
- [ ] Refactor progressif de `app.js` en modules (optionnel)
- [ ] CI simple pour exécuter les tests automatiquement (optionnel)
