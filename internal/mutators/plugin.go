package mutators

import (
	"io/fs"
	"strings"

	"github.com/GoMudEngine/GoMud/internal/fileloader"
	"github.com/GoMudEngine/GoMud/internal/mudlog"
	"gopkg.in/yaml.v2"
)

var (
	pluginFileSystems []fileloader.ReadableGroupFS
)

// RegisterFS registers a plugin file system to be searched when loading mutator
// data files. Must be called before LoadDataFiles().
func RegisterFS(f ...fileloader.ReadableGroupFS) {
	pluginFileSystems = append(pluginFileSystems, f...)
}

// loadPluginMutators walks every sub-filesystem of every registered plugin FS,
// reading mutator YAML files from a "mutators/" prefix and merging them into dst.
func loadPluginMutators(dst map[string]*MutatorSpec) {
	for _, groupFS := range pluginFileSystems {
		for subFS := range groupFS.AllFileSubSystems {
			loadMutatorsFromFS(subFS, dst)
		}
	}
}

func loadMutatorsFromFS(subFS fs.ReadFileFS, dst map[string]*MutatorSpec) {
	if pl, ok := subFS.(fileloader.PathLister); ok {
		for _, path := range pl.KnownPaths() {
			if !strings.HasPrefix(path, `mutators/`) || !strings.HasSuffix(path, `.yaml`) {
				continue
			}
			loadMutatorFileFromFS(subFS, path, dst)
		}
		return
	}

	_ = fs.WalkDir(subFS, `mutators`, func(path string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() || !strings.HasSuffix(path, `.yaml`) {
			return nil
		}
		loadMutatorFileFromFS(subFS, path, dst)
		return nil
	})
}

func loadMutatorFileFromFS(subFS fs.ReadFileFS, path string, dst map[string]*MutatorSpec) {
	b, err := subFS.ReadFile(path)
	if err != nil {
		mudlog.Error("mutators.loadMutatorsFromFS", "path", path, "error", err)
		return
	}

	var spec MutatorSpec
	if err := yaml.Unmarshal(b, &spec); err != nil {
		mudlog.Error("mutators.loadMutatorsFromFS", "path", path, "error", err)
		return
	}

	if !strings.HasSuffix(path, spec.Filepath()) {
		mudlog.Error("mutators.loadMutatorsFromFS", "path", path, "expected suffix", spec.Filepath(), "error", "filepath mismatch")
		return
	}

	if err := spec.Validate(); err != nil {
		mudlog.Error("mutators.loadMutatorsFromFS", "path", path, "error", err)
		return
	}

	if _, exists := dst[spec.MutatorId]; exists {
		mudlog.Error("mutators.loadMutatorsFromFS", "mutatorId", spec.MutatorId, "path", path, "error", "duplicate mutator id")
		return
	}

	dst[spec.MutatorId] = &spec
}
