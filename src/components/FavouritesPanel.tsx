import FolderTreeNode from "./FolderTreeNode";

interface Props {
  favourites: string[];
  openFolderPath: string | null;
  selectedPath: string | null;
  onSelectFolder: (path: string) => void;
  onOpenFolder: (path: string) => void;
  onDropPhoto: (photoPaths: string[], destFolder: string) => void;
  onTogglePin: (path: string) => void;
}

function basename(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

export default function FavouritesPanel({
  favourites,
  openFolderPath,
  selectedPath,
  onSelectFolder,
  onOpenFolder,
  onDropPhoto,
  onTogglePin,
}: Props) {
  if (favourites.length === 0) {
    return (
      <p className="sidebar__hint">No favourites yet — click the ☆ next to any folder above to pin it here.</p>
    );
  }

  return (
    <div className="favourites">
      {favourites.map((path) => (
        <FolderTreeNode
          key={path}
          entry={{ path, name: basename(path), hasChildren: true }}
          depth={0}
          openFolderPath={openFolderPath}
          selectedPath={selectedPath}
          onSelectFolder={onSelectFolder}
          favourites={favourites}
          onOpenFolder={onOpenFolder}
          onDropPhoto={onDropPhoto}
          onTogglePin={onTogglePin}
        />
      ))}
    </div>
  );
}
