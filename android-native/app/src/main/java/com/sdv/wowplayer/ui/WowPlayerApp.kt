package com.sdv.wowplayer.ui

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ClearAll
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.LibraryMusic
import androidx.compose.material.icons.filled.PauseCircleFilled
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.PlayCircleFilled
import androidx.compose.material.icons.filled.PlaylistAdd
import androidx.compose.material.icons.filled.PlaylistPlay
import androidx.compose.material.icons.filled.QueueMusic
import androidx.compose.material.icons.filled.Repeat
import androidx.compose.material.icons.filled.RepeatOne
import androidx.compose.material.icons.filled.Shuffle
import androidx.compose.material.icons.filled.SkipNext
import androidx.compose.material.icons.filled.SkipPrevious
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Slider
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.sdv.wowplayer.core.model.Track
import com.sdv.wowplayer.domain.player.PlaybackStatus
import com.sdv.wowplayer.domain.player.PlayerUiState
import com.sdv.wowplayer.domain.player.PlayerViewModel
import com.sdv.wowplayer.domain.player.RepeatModeSetting
import com.sdv.wowplayer.domain.player.VisualizerMode
import com.sdv.wowplayer.domain.playlist.UserPlaylist
import kotlin.math.abs

private enum class MainTab {
    Library,
    Player,
    Playlists
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WowPlayerApp(viewModel: PlayerViewModel) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val snackbarHostState = remember { SnackbarHostState() }
    var selectedTab by rememberSaveable { mutableStateOf(MainTab.Library) }

    var trackToAddInPlaylist by remember { mutableStateOf<Track?>(null) }
    var showCreatePlaylistDialog by remember { mutableStateOf(false) }
    var pendingTrackForNewPlaylist by remember { mutableStateOf<Track?>(null) }

    LaunchedEffect(selectedTab) {
        viewModel.setPlayerScreenVisible(selectedTab == MainTab.Player)
    }

    val permission = remember {
        if (Build.VERSION.SDK_INT >= 33) {
            Manifest.permission.READ_MEDIA_AUDIO
        } else {
            Manifest.permission.READ_EXTERNAL_STORAGE
        }
    }

    val requestPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) {
            viewModel.loadMediaStoreLibrary()
        } else {
            viewModel.clearError()
        }
    }

    val openDocumentsLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenMultipleDocuments()
    ) { uris ->
        if (uris.isNotEmpty()) {
            val flags = Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
            uris.forEach { uri ->
                runCatching {
                    context.contentResolver.takePersistableUriPermission(uri, flags)
                }
            }
            viewModel.addSafTracks(uris)
            selectedTab = MainTab.Player
        }
    }

    LaunchedEffect(uiState.errorMessage) {
        uiState.errorMessage?.let { message ->
            snackbarHostState.showSnackbar(message)
            viewModel.clearError()
        }
    }

    if (trackToAddInPlaylist != null) {
        AddTrackToPlaylistDialog(
            track = trackToAddInPlaylist!!,
            playlists = uiState.playlists,
            onDismiss = { trackToAddInPlaylist = null },
            onSelectPlaylist = { playlistId, track ->
                viewModel.addTrackToPlaylist(playlistId, track)
                trackToAddInPlaylist = null
                selectedTab = MainTab.Playlists
            },
            onCreateNewPlaylist = { track ->
                pendingTrackForNewPlaylist = track
                showCreatePlaylistDialog = true
                trackToAddInPlaylist = null
            }
        )
    }

    if (showCreatePlaylistDialog) {
        PlaylistNameDialog(
            title = "Новый плейлист",
            confirmLabel = "Создать",
            initialName = "",
            onDismiss = {
                showCreatePlaylistDialog = false
                pendingTrackForNewPlaylist = null
            },
            onConfirm = { name ->
                viewModel.createPlaylist(name, pendingTrackForNewPlaylist)
                showCreatePlaylistDialog = false
                pendingTrackForNewPlaylist = null
                selectedTab = MainTab.Playlists
            }
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = "WOW Native Player",
                        style = MaterialTheme.typography.titleLarge
                    )
                }
            )
        },
        snackbarHost = { SnackbarHost(hostState = snackbarHostState) },
        bottomBar = {
            NavigationBar {
                NavigationBarItem(
                    selected = selectedTab == MainTab.Library,
                    onClick = { selectedTab = MainTab.Library },
                    icon = { Icon(Icons.Default.LibraryMusic, contentDescription = null) },
                    label = { Text("Библиотека") }
                )
                NavigationBarItem(
                    selected = selectedTab == MainTab.Player,
                    onClick = { selectedTab = MainTab.Player },
                    icon = { Icon(Icons.Default.PlayArrow, contentDescription = null) },
                    label = { Text("Плеер") }
                )
                NavigationBarItem(
                    selected = selectedTab == MainTab.Playlists,
                    onClick = { selectedTab = MainTab.Playlists },
                    icon = { Icon(Icons.Default.PlaylistPlay, contentDescription = null) },
                    label = { Text("Плейлисты") }
                )
            }
        }
    ) { padding ->
        when (selectedTab) {
            MainTab.Library -> LibraryScreen(
                state = uiState,
                contentPadding = padding,
                onPickSaf = { openDocumentsLauncher.launch(arrayOf("audio/*")) },
                onLoadMediaStore = {
                    val granted = ContextCompat.checkSelfPermission(
                        context,
                        permission
                    ) == PackageManager.PERMISSION_GRANTED

                    if (granted) {
                        viewModel.loadMediaStoreLibrary()
                    } else {
                        requestPermissionLauncher.launch(permission)
                    }
                },
                onTrackPlay = {
                    viewModel.playLibraryTrack(it)
                    selectedTab = MainTab.Player
                },
                onTrackQueue = viewModel::enqueueTrack,
                onTrackAddToPlaylist = { track ->
                    trackToAddInPlaylist = track
                },
                onDismissLibraryError = viewModel::clearLibraryError
            )

            MainTab.Player -> PlayerScreen(
                state = uiState,
                contentPadding = padding,
                onPlayPause = viewModel::togglePlayPause,
                onNext = viewModel::playNext,
                onPrevious = viewModel::playPrevious,
                onSeekTo = viewModel::seekTo,
                onQueueTrackClick = viewModel::playQueueTrack,
                onClearQueue = viewModel::clearQueue,
                onVisualizerModeChange = viewModel::setVisualizerMode,
                onRepeatClick = viewModel::cycleRepeatMode,
                onShuffleClick = viewModel::toggleShuffle,
                onQueueTrackAddToPlaylist = { track ->
                    trackToAddInPlaylist = track
                }
            )

            MainTab.Playlists -> PlaylistsScreen(
                state = uiState,
                contentPadding = padding,
                onCreatePlaylist = {
                    pendingTrackForNewPlaylist = null
                    showCreatePlaylistDialog = true
                },
                onRenamePlaylist = viewModel::renamePlaylist,
                onDeletePlaylist = viewModel::deletePlaylist,
                onPlayPlaylist = { playlistId ->
                    viewModel.playPlaylist(playlistId)
                    selectedTab = MainTab.Player
                },
                onRemoveTrackFromPlaylist = viewModel::removeTrackFromPlaylist
            )
        }
    }
}

@Composable
private fun LibraryScreen(
    state: PlayerUiState,
    contentPadding: PaddingValues,
    onPickSaf: () -> Unit,
    onLoadMediaStore: () -> Unit,
    onTrackPlay: (Int) -> Unit,
    onTrackQueue: (Track) -> Unit,
    onTrackAddToPlaylist: (Track) -> Unit,
    onDismissLibraryError: () -> Unit
) {
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(contentPadding),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item {
            Text(
                text = "Добавить треки",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )
        }

        item {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Button(onClick = onPickSaf) {
                    Icon(Icons.Default.Add, contentDescription = null)
                    Spacer(Modifier.size(8.dp))
                    Text("SAF picker")
                }
                Button(onClick = onLoadMediaStore) {
                    Icon(Icons.Default.LibraryMusic, contentDescription = null)
                    Spacer(Modifier.size(8.dp))
                    Text(if (state.isLoadingLibrary) "Сканирую..." else "MediaStore")
                }
            }
        }

        if (state.isLoadingLibrary) {
            item {
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(
                            text = "Сканирую MediaStore...",
                            style = MaterialTheme.typography.bodyMedium
                        )
                        Spacer(Modifier.height(10.dp))
                        LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
                    }
                }
            }
        }

        state.libraryErrorMessage?.let { error ->
            item {
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(
                            text = "Ошибка чтения библиотеки",
                            style = MaterialTheme.typography.titleSmall,
                            color = MaterialTheme.colorScheme.error,
                            fontWeight = FontWeight.SemiBold
                        )
                        Spacer(Modifier.height(6.dp))
                        Text(text = error, style = MaterialTheme.typography.bodyMedium)
                        Spacer(Modifier.height(8.dp))
                        TextButton(onClick = onDismissLibraryError) {
                            Text("Скрыть")
                        }
                    }
                }
            }
        }

        if (state.libraryTracks.isEmpty() && !state.isLoadingLibrary) {
            item {
                Card(modifier = Modifier.fillMaxWidth()) {
                    Text(
                        modifier = Modifier.padding(16.dp),
                        text = "MediaStore библиотека пока пустая. Можно сразу добавить файлы через SAF picker.",
                        style = MaterialTheme.typography.bodyMedium
                    )
                }
            }
        } else if (state.libraryTracks.isNotEmpty()) {
            item {
                Text(
                    text = "Треки из MediaStore (${state.libraryTracks.size})",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold
                )
            }

            itemsIndexed(
                items = state.libraryTracks,
                key = { _, track -> track.id }
            ) { index, track ->
                TrackRow(
                    track = track,
                    onPlay = { onTrackPlay(index) },
                    onQueue = { onTrackQueue(track) },
                    onAddToPlaylist = { onTrackAddToPlaylist(track) }
                )
            }
        }
    }
}

@Composable
private fun PlayerScreen(
    state: PlayerUiState,
    contentPadding: PaddingValues,
    onPlayPause: () -> Unit,
    onNext: () -> Unit,
    onPrevious: () -> Unit,
    onSeekTo: (Long) -> Unit,
    onQueueTrackClick: (Int) -> Unit,
    onClearQueue: () -> Unit,
    onVisualizerModeChange: (VisualizerMode) -> Unit,
    onRepeatClick: () -> Unit,
    onShuffleClick: () -> Unit,
    onQueueTrackAddToPlaylist: (Track) -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(contentPadding)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        StatusStrip(state = state)

        val currentTrack = state.currentTrack
        if (currentTrack == null) {
            Card(modifier = Modifier.fillMaxWidth()) {
                Text(
                    modifier = Modifier.padding(16.dp),
                    text = "Очередь пуста. Добавьте файлы на экране библиотеки.",
                    style = MaterialTheme.typography.bodyLarge
                )
            }
        } else {
            CurrentTrackCard(
                state = state,
                onSeekTo = onSeekTo,
                onPlayPause = onPlayPause,
                onPrevious = onPrevious,
                onNext = onNext,
                onRepeatClick = onRepeatClick,
                onShuffleClick = onShuffleClick
            )
        }

        VisualizerModeRow(
            mode = state.visualizerMode,
            onModeChange = onVisualizerModeChange
        )

        if (state.visualizerMode == VisualizerMode.ULTRA_LIGHT && state.currentTrack != null) {
            UltraLightVisualizer(
                progressMs = state.positionMs,
                durationMs = state.durationMs,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(42.dp)
            )
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = "Очередь (${state.queueTracks.size})",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )
            IconButton(
                onClick = onClearQueue,
                enabled = state.queueTracks.isNotEmpty()
            ) {
                Icon(Icons.Default.ClearAll, contentDescription = "Clear queue")
            }
        }

        if (state.queueTracks.isEmpty()) {
            Text(
                text = "Пока пусто",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        } else {
            LazyColumn(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                itemsIndexed(
                    items = state.queueTracks,
                    key = { _, track -> track.id + track.uri.toString() }
                ) { index, track ->
                    Card {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 12.dp, vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(
                                imageVector = Icons.Default.QueueMusic,
                                contentDescription = null
                            )
                            Spacer(Modifier.size(10.dp))
                            Column(modifier = Modifier.weight(1f)) {
                                Text(track.title, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Text(
                                    track.artist,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                            IconButton(onClick = { onQueueTrackAddToPlaylist(track) }) {
                                Icon(Icons.Default.PlaylistAdd, contentDescription = "Добавить в плейлист")
                            }
                            if (index == state.currentIndex) {
                                Text("▶")
                            } else {
                                TextButton(onClick = { onQueueTrackClick(index) }) {
                                    Text("Play")
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun PlaylistsScreen(
    state: PlayerUiState,
    contentPadding: PaddingValues,
    onCreatePlaylist: () -> Unit,
    onRenamePlaylist: (String, String) -> Unit,
    onDeletePlaylist: (String) -> Unit,
    onPlayPlaylist: (String) -> Unit,
    onRemoveTrackFromPlaylist: (String, Track) -> Unit
) {
    var selectedPlaylistId by rememberSaveable { mutableStateOf<String?>(null) }
    var renameTarget by remember { mutableStateOf<UserPlaylist?>(null) }
    var deleteTarget by remember { mutableStateOf<UserPlaylist?>(null) }

    LaunchedEffect(state.playlists) {
        val ids = state.playlists.map { it.id }.toSet()
        if (selectedPlaylistId == null || selectedPlaylistId !in ids) {
            selectedPlaylistId = state.playlists.firstOrNull()?.id
        }
    }

    renameTarget?.let { target ->
        PlaylistNameDialog(
            title = "Переименовать плейлист",
            confirmLabel = "Сохранить",
            initialName = target.name,
            onDismiss = { renameTarget = null },
            onConfirm = { newName ->
                onRenamePlaylist(target.id, newName)
                renameTarget = null
            }
        )
    }

    deleteTarget?.let { target ->
        AlertDialog(
            onDismissRequest = { deleteTarget = null },
            title = { Text("Удалить плейлист?") },
            text = { Text("${target.name} будет удалён вместе с треками внутри.") },
            confirmButton = {
                TextButton(
                    onClick = {
                        onDeletePlaylist(target.id)
                        deleteTarget = null
                    }
                ) {
                    Text("Удалить")
                }
            },
            dismissButton = {
                TextButton(onClick = { deleteTarget = null }) {
                    Text("Отмена")
                }
            }
        )
    }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(contentPadding),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Плейлисты",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold
                )
                Button(onClick = onCreatePlaylist) {
                    Icon(Icons.Default.Add, contentDescription = null)
                    Spacer(Modifier.size(6.dp))
                    Text("Создать")
                }
            }
        }

        if (state.playlists.isEmpty()) {
            item {
                Card(modifier = Modifier.fillMaxWidth()) {
                    Text(
                        modifier = Modifier.padding(16.dp),
                        text = "Плейлистов пока нет. Создайте первый и добавляйте треки из библиотеки или очереди.",
                        style = MaterialTheme.typography.bodyMedium
                    )
                }
            }
        } else {
            itemsIndexed(
                items = state.playlists,
                key = { _, playlist -> playlist.id }
            ) { _, playlist ->
                val isSelected = playlist.id == selectedPlaylistId
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(
                            color = if (isSelected) {
                                MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f)
                            } else {
                                Color.Transparent
                            },
                            shape = RoundedCornerShape(12.dp)
                        )
                ) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = playlist.name,
                                    style = MaterialTheme.typography.titleSmall,
                                    fontWeight = FontWeight.SemiBold
                                )
                                Text(
                                    text = "Треков: ${playlist.tracks.size}",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                            IconButton(onClick = { renameTarget = playlist }) {
                                Icon(Icons.Default.Edit, contentDescription = "Rename playlist")
                            }
                            IconButton(onClick = { deleteTarget = playlist }) {
                                Icon(Icons.Default.Delete, contentDescription = "Delete playlist")
                            }
                        }

                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            TextButton(onClick = { selectedPlaylistId = playlist.id }) {
                                Text(if (isSelected) "Выбран ✓" else "Открыть")
                            }
                            TextButton(onClick = { onPlayPlaylist(playlist.id) }) {
                                Text("Play all")
                            }
                        }
                    }
                }
            }

            val selectedPlaylist = state.playlists.firstOrNull { it.id == selectedPlaylistId }
            if (selectedPlaylist != null) {
                item {
                    Text(
                        text = "${selectedPlaylist.name}: треки",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold
                    )
                }

                if (selectedPlaylist.tracks.isEmpty()) {
                    item {
                        Card(modifier = Modifier.fillMaxWidth()) {
                            Text(
                                modifier = Modifier.padding(16.dp),
                                text = "Плейлист пуст. Добавьте треки из библиотеки или очереди.",
                                style = MaterialTheme.typography.bodyMedium
                            )
                        }
                    }
                } else {
                    itemsIndexed(
                        items = selectedPlaylist.tracks,
                        key = { _, track -> track.id + track.uri.toString() }
                    ) { _, track ->
                        Card(modifier = Modifier.fillMaxWidth()) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 12.dp, vertical = 10.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(track.title, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    Text(
                                        track.artist,
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                                IconButton(onClick = { onRemoveTrackFromPlaylist(selectedPlaylist.id, track) }) {
                                    Icon(Icons.Default.Delete, contentDescription = "Удалить трек")
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun AddTrackToPlaylistDialog(
    track: Track,
    playlists: List<UserPlaylist>,
    onDismiss: () -> Unit,
    onSelectPlaylist: (String, Track) -> Unit,
    onCreateNewPlaylist: (Track) -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Добавить в плейлист") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    text = track.title,
                    style = MaterialTheme.typography.bodyMedium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )

                if (playlists.isEmpty()) {
                    Text("Сначала создайте плейлист")
                } else {
                    playlists.forEach { playlist ->
                        TextButton(onClick = { onSelectPlaylist(playlist.id, track) }) {
                            Text(playlist.name)
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = { onCreateNewPlaylist(track) }) {
                Text("Новый плейлист")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Отмена")
            }
        }
    )
}

@Composable
private fun PlaylistNameDialog(
    title: String,
    confirmLabel: String,
    initialName: String,
    onDismiss: () -> Unit,
    onConfirm: (String) -> Unit
) {
    var value by remember(initialName) { mutableStateOf(initialName) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            OutlinedTextField(
                value = value,
                onValueChange = { value = it },
                singleLine = true,
                label = { Text("Название") }
            )
        },
        confirmButton = {
            TextButton(onClick = { onConfirm(value) }) {
                Text(confirmLabel)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Отмена")
            }
        }
    )
}

@Composable
private fun StatusStrip(state: PlayerUiState) {
    val text = when {
        state.isRestoringSession -> "Восстановление предыдущей сессии..."
        else -> when (state.playbackStatus) {
            PlaybackStatus.DISCONNECTED -> "Подключение к сервису..."
            PlaybackStatus.IDLE -> "Ожидание"
            PlaybackStatus.BUFFERING -> "Буферизация"
            PlaybackStatus.READY -> if (state.isPlaying) "Воспроизведение" else "Пауза"
            PlaybackStatus.ENDED -> "Очередь завершена"
            PlaybackStatus.ERROR -> "Ошибка воспроизведения"
        }
    }

    Text(
        text = text,
        style = MaterialTheme.typography.labelLarge,
        color = MaterialTheme.colorScheme.onSurfaceVariant
    )
}

@Composable
private fun CurrentTrackCard(
    state: PlayerUiState,
    onSeekTo: (Long) -> Unit,
    onPlayPause: () -> Unit,
    onPrevious: () -> Unit,
    onNext: () -> Unit,
    onRepeatClick: () -> Unit,
    onShuffleClick: () -> Unit
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                text = state.currentTrack?.title.orEmpty(),
                style = MaterialTheme.typography.titleLarge,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                text = state.currentTrack?.artist.orEmpty(),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            Spacer(Modifier.height(14.dp))

            RepeatShuffleRow(
                repeatMode = state.repeatMode,
                shuffleEnabled = state.shuffleEnabled,
                onRepeatClick = onRepeatClick,
                onShuffleClick = onShuffleClick
            )

            Spacer(Modifier.height(12.dp))

            val duration = state.durationMs.coerceAtLeast(1L)
            var sliderPosition by remember(state.currentTrack?.id, duration) {
                mutableFloatStateOf(state.positionMs.coerceAtMost(duration).toFloat())
            }
            var userSeeking by remember { mutableStateOf(false) }

            LaunchedEffect(state.positionMs, state.currentTrack?.id, duration) {
                if (!userSeeking) {
                    sliderPosition = state.positionMs.coerceAtMost(duration).toFloat()
                }
            }

            Slider(
                value = sliderPosition,
                onValueChange = {
                    userSeeking = true
                    sliderPosition = it
                },
                onValueChangeFinished = {
                    userSeeking = false
                    onSeekTo(sliderPosition.toLong())
                },
                valueRange = 0f..duration.toFloat(),
                enabled = state.controlsEnabled
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(formatDuration(state.positionMs))
                Text(formatDuration(state.durationMs))
            }

            Spacer(Modifier.height(12.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(
                    onClick = onPrevious,
                    enabled = state.canSkipPrevious
                ) {
                    Icon(Icons.Default.SkipPrevious, contentDescription = "Previous")
                }
                FilledIconButton(
                    onClick = onPlayPause,
                    enabled = state.controlsEnabled,
                    modifier = Modifier.size(72.dp)
                ) {
                    Icon(
                        imageVector = if (state.isPlaying) {
                            Icons.Default.PauseCircleFilled
                        } else {
                            Icons.Default.PlayCircleFilled
                        },
                        contentDescription = "Play pause",
                        modifier = Modifier.size(54.dp)
                    )
                }
                IconButton(
                    onClick = onNext,
                    enabled = state.canSkipNext
                ) {
                    Icon(Icons.Default.SkipNext, contentDescription = "Next")
                }
            }
        }
    }
}

@Composable
private fun RepeatShuffleRow(
    repeatMode: RepeatModeSetting,
    shuffleEnabled: Boolean,
    onRepeatClick: () -> Unit,
    onShuffleClick: () -> Unit
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        TextButton(onClick = onShuffleClick) {
            Icon(Icons.Default.Shuffle, contentDescription = null)
            Spacer(Modifier.size(4.dp))
            Text(if (shuffleEnabled) "Shuffle ON" else "Shuffle OFF")
        }

        TextButton(onClick = onRepeatClick) {
            when (repeatMode) {
                RepeatModeSetting.OFF -> Icon(Icons.Default.Repeat, contentDescription = null)
                RepeatModeSetting.ALL -> Icon(Icons.Default.Repeat, contentDescription = null)
                RepeatModeSetting.ONE -> Icon(Icons.Default.RepeatOne, contentDescription = null)
            }
            Spacer(Modifier.size(4.dp))
            Text(
                when (repeatMode) {
                    RepeatModeSetting.OFF -> "Repeat OFF"
                    RepeatModeSetting.ALL -> "Repeat ALL"
                    RepeatModeSetting.ONE -> "Repeat ONE"
                }
            )
        }
    }
}

@Composable
private fun VisualizerModeRow(
    mode: VisualizerMode,
    onModeChange: (VisualizerMode) -> Unit
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        TextButton(onClick = { onModeChange(VisualizerMode.OFF) }) {
            Text(if (mode == VisualizerMode.OFF) "Visualizer: OFF ✓" else "Visualizer: OFF")
        }
        TextButton(onClick = { onModeChange(VisualizerMode.ULTRA_LIGHT) }) {
            Text(
                if (mode == VisualizerMode.ULTRA_LIGHT) {
                    "Ultra-light ✓"
                } else {
                    "Ultra-light"
                }
            )
        }
    }
}

@Composable
private fun UltraLightVisualizer(
    progressMs: Long,
    durationMs: Long,
    modifier: Modifier = Modifier
) {
    val safeDuration = durationMs.coerceAtLeast(1L)
    val fraction = (progressMs.coerceAtLeast(0L) % safeDuration).toFloat() / safeDuration.toFloat()

    Canvas(modifier = modifier) {
        val bars = 12
        val gap = 6.dp.toPx()
        val widthPerBar = (size.width - gap * (bars - 1)) / bars

        repeat(bars) { index ->
            val phase = fraction * 360f + index * 29f
            val normalized = (abs(kotlin.math.sin(Math.toRadians(phase.toDouble())))).toFloat()
            val height = size.height * (0.25f + normalized * 0.75f)
            val x = index * (widthPerBar + gap)
            val y = size.height - height
            drawRoundRect(
                color = Color(0xFF74C0FC),
                topLeft = androidx.compose.ui.geometry.Offset(x, y),
                size = androidx.compose.ui.geometry.Size(widthPerBar, height),
                cornerRadius = CornerRadius(widthPerBar / 2f)
            )
        }
    }
}

@Composable
private fun TrackRow(
    track: Track,
    onPlay: () -> Unit,
    onQueue: () -> Unit,
    onAddToPlaylist: () -> Unit
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = track.title,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    text = track.artist,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            IconButton(onClick = onAddToPlaylist) {
                Icon(Icons.Default.PlaylistAdd, contentDescription = "Добавить в плейлист")
            }
            IconButton(onClick = onQueue) {
                Icon(Icons.Default.Add, contentDescription = "Queue")
            }
            IconButton(onClick = onPlay) {
                Icon(Icons.Default.PlayArrow, contentDescription = "Play")
            }
        }
    }
}

private fun formatDuration(value: Long): String {
    if (value <= 0L) return "00:00"
    val totalSeconds = value / 1000
    val minutes = totalSeconds / 60
    val seconds = totalSeconds % 60
    return "%02d:%02d".format(minutes, seconds)
}