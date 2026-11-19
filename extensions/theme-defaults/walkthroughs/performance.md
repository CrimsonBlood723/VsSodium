# Keep memory use under control

There is no single setting that safely caps all workbench memory. First identify the process or extension using memory:

1. Open **Developer: Open Process Explorer** and note whether the renderer, extension host, or another process is growing.
2. Open **Developer: Show Running Extensions** and disable extensions you do not use.
3. Close unused editor groups and large workspaces. Exclude generated folders from watching only if your build workflow does not rely on file-change notifications.

VsSodium already starts with the minimap off and reduced motion enabled. These defaults reduce visual work without changing language features.

If a project contains large generated folders, add only the paths that are disposable build output to that project's `.vscode/settings.json`. For example:

```json
{
  "files.watcherExclude": {
    "**/target/**": true,
    "**/dist/**": true
  }
}
```

Skip a path if your tools need to watch it. Keeping these exclusions in the workspace makes the trade-off local to that project.

Rust is a good fit for isolated native tools that profiling shows to be CPU or memory hot spots. Moving code to Rust alone does not reduce the memory used by the Electron workbench; a Rust helper also adds a process and its own memory cost. VsSodium keeps native work out of the runtime until measurements justify it.
