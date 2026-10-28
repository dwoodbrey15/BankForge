# BankForge for iPhone

Two offline-capable Home Screen web apps, packaged for **GitHub Pages**. No build step, backend, account, cloud training, API key or runtime CDN is required. Neural 9 is included with its actual trained weights.

- **`play/` — Bank Pilot Neural.** The 4.7.4-style scorekeeper and adviser, restricted to modern neural networks. There are no Monte Carlo, search, target-policy, solo or alternate adviser modes.
- **`train/` — BankForge Trainer.** Local PPO training, opponent pools, benchmarks, saved runs and plots on the phone. This is a browser implementation of the desktop training pipeline; PyTorch/CUDA itself does not run on iPhone.

## Upload to GitHub

1. Unzip the package. Upload **the contents of this folder** to the root of your GitHub repository. `index.html`, `sw.js`, `play`, `train`, `shared`, `models` and `vendor` should be at the repository root. Keep `.nojekyll` too. Do not upload only the ZIP file.
2. In the repository, open **Settings → Pages**. Choose **Deploy from a branch**, your branch (usually `main`), and **`/ (root)`**. Save.
3. Open the resulting HTTPS Pages URL. Both user sites and repository subpaths work; no repository name is hardcoded.
4. Open **Bank Pilot**, wait for **Offline ready**, then use Safari **Share → Add to Home Screen**. Repeat for **BankForge Trainer** for a separate icon.
5. Open each installed app once online and wait for **Offline ready** before using airplane mode. An initial online visit is required to install the files. After caching, advice, imports/exports, training and benchmarking work offline.

Do not open `index.html` directly from the Files app: `file://` does not provide the service-worker and worker environment these apps need. GitHub Pages provides HTTPS. The local preview alternative on a PC is `python -m http.server 8000` in this folder, then `http://localhost:8000/` on that PC.

## Player

Neural 9 is the frozen **state-only attention / exact safe-pot CDF** checkpoint, width 16, depth 2, **9,506 parameters**, trained through update 83 / 71,712 games. Its source checkpoint SHA-256 is `5e884fdf281023b0d4e2f4d40787dee018e22cc89733f9d02b61c76b26fd013e`. No retraining or weight edits were made to preinstall it.

Choose 3–8 players and 10, 15 or 20 rounds. Enter the dice and bank announcements from your real game. The first three rolls are safe. Anyone can bank after roll three; multiple players may bank at the same pot. The Table view lets you record those banks and correct scores. Undo, state corrections and game backup/restore are available. Exact integer scores are retained using BigInt.

The loaded model's recorded action rule is preserved: Bernoulli sampling for modern checkpoints, greedy behavior for older greedy checkpoints. The desktop's existing fixed proven-rule overrides are retained; they are not a search mode. Probabilities shown are the **network's bank/continue probabilities, not predicted win rates**. Refreshing a view does not resample the same decision. New public game events produce new decisions. No opponent policies or alternate playing styles can be selected in this player.

In Networks, import the desktop trainer's **`best-weights.json`**, or a model exported by the phone trainer. Imported networks are stored locally. The player supports all modern desktop MLP, attention, state-only, Set Transformer and public-memory/prediction schemas. The legacy old champion is available as a training opponent in the trainer, not as another player adviser type.

## Trainer

Choose random initialization or initialize from Neural 9 / an imported model. A loaded saved run resumes its own model and architecture. Click **New run** to change architecture. Width and depth are adjustable. Both state-only MLP and state-only attention retain the exact safe-pot percentile input.

All ten desktop architecture families are supported, including original MLP, state-only MLP, original attention, the three state-only attention encodings, plain Set Transformer, attention + GRU, Set + GRU and Set + GRU + prediction. Actor and critic heads, SiLU, LayerNorm, cosine attention, GRU gate convention, padding masks and self-attention follow the desktop model equations. Prediction-head supervision uses public event boundaries, not private polling order.

PPO includes GAE, clipped actor and critic losses, entropy regularization, gradient clipping, target-KL early stopping and rollback, with optional potential-based feedback. Reward options are win credit, win-rate multiple (`credit × players / 8`) and average placement. **Positive first-place ties split win credit `1/K`; an all-zero game awards zero.** Game scoring does not reward second or third place unless placement is explicitly chosen. Potential feedback uses only current public features, with terminal potential zero.

The default workload is deliberately smaller than the PC workload: **72 games/update**, **360 benchmark tables**, width 16, 4 PPO epochs, learning rate 0.0003. These are phone starting settings, not claims of optimal tuning. For a more stable comparison, increase benchmark length to 1,800 or 3,600. Very short tests are noisy. The phone has a per-update memory guard and limits individual workloads; large models and memory architectures can be much slower.

**Auto** tries GPU/WebGL for tensor training and falls back to CPU if unavailable. Dice simulation and rollout inference use JavaScript in a dedicated worker. There is no CUDA or Apple Neural Engine integration. Keep the app visible while training. Hiding it requests a pause; iOS may suspend it immediately. Completed updates are autosaved before benchmarking, and completed benchmark results are saved afterward. An incomplete collection/PPO update is discarded on pause or interruption. Screen wake lock is requested when supported. This is not background training while the phone is locked.

Training and benchmarking have independent selected pools, seating modes and table sizes (3–8). The game-length selection applies to both, with 10/15/20 selected initially. The modes are:

- **Equal-entry league:** balanced engine appearances across table sizes; the learner need not be at every table.
- **Reserved priority:** learner always present, followed by guaranteed opponents in editable priority order; remaining seats use selected fillers.
- **One reserved opponent at a time:** learner plus one rotating reserved rival, with selected nonreserved fillers.

Each engine type appears at most once per table. Reimporting identical weights with the same action rule does not add another engine type. The eight original scripts and old champion retain the unchanged desktop policy code. Past snapshot opponents are optional (every 8 updates, latest 4 retained) and enter training only.

Best model selection uses the highest **approximate 95% lower confidence bound** of the chosen metric. There is no minimum appearance threshold. Benchmark length can change while resuming; changing the benchmark population, seating, table sizes or selection metric starts a separate best comparison. Win rate uses own appearances, not total league tables. Average win-rate multiple is the equal average of `N × win rate at N` over selected sizes; all sizes must have observations to promote using this metric. Wilson bounds are approximate for fractional win credit; multiple/placement use bounded-score confidence bounds as on desktop. Fresh benchmark seeds are default; a fixed seed is optional.

Results include model visibility, actual or EMA-only curves, arbitrary finite EMA length ≥1, win-rate / multiple / placement views, best-update marker, standings and per-size results. EMA affects display only. A separate custom benchmark tests any selected engines without changing the learner's latest or best model; its results can be exported. The phone's custom test reports game metrics; the desktop's batch Elo/TrueSkill analysis tools remain desktop tools.

## Move models between phone and PC

- **PC → phone:** import the run's automatic `best-weights.json`. This is the simplest route. For a different `.pt`, use `tools/convert_checkpoint.py best.pt` (Python + PyTorch required on the PC), or double-click `tools/Convert-Checkpoint.cmd` and choose a file. The converter creates `best-portable.json` without changing the `.pt`.
- **Trainer → player:** stop training, open Models and **Export best model** (or latest), save the JSON in Files, then import it in Bank Pilot → Networks. Installed iPhone apps may isolate storage, so file export/import is the reliable transfer method. Where browser storage is shared, library imports are visible to both apps.
- **Phone → PC:** `python tools/convert_checkpoint.py my-model.json` creates `my-model-converted.pt` for modern BankForge. Network weights and action sampling are preserved. The PC optimizer starts fresh. A **full run JSON** is what resumes the phone's own Adam state, settings, benchmark history and best checkpoint.

Runs, models and games are saved locally in IndexedDB. Export important data; clearing site storage or browser storage eviction can remove it. Nothing is uploaded to GitHub or any server by the running apps. Uploading this source package to your repository publishes only the bundled Neural 9 model, not future locally trained models.

## Validation and limits

Validation records are in `tests/`. CPU inference and TensorFlow outputs were compared with PyTorch for all 10 architectures at both depths, including public-memory variants. Counter-based sampling matches the desktop's Float32 RNG exactly. Gradient updates, optimizer serialization/resume, full PPO training, checkpoint selection and custom benchmark repeatability were tested. Browser QA uses a 390×844 viewport and includes real GPU/WebGL training, saved-run reload and offline reloads. No physical iPhone was attached, so Safari/device-specific throughput and thermal behavior have not been measured.

The `vendor/` folder includes pinned TensorFlow.js **4.22.0** and its Apache 2.0 license. All runtime assets are local. The service worker cache is scoped to this repository path, so it does not remove another app's caches. When updating the site, include the new `sw.js` and all assets together, reconnect and reload to install the new cache. These are installable web apps, not App Store IPA binaries.
