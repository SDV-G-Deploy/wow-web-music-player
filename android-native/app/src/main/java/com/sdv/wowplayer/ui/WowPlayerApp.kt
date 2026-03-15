package com.sdv.wowplayer.ui

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.LibraryMusic
import androidx.compose.material.icons.filled.PauseCircleFilled
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.PlayCircleFilled
import androidx.compose.material.icons.filled.QueueMusic
import androidx.compose.material.icons.filled.SkipNext
import androidx.compose.material.icons.filled.SkipPrevious
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.sdv.wowplayer.core.model.Track
import com.sdv.wowplayer.domain.player.PlayerUiState
import com.sdv.wowplayer.domain.player.PlayerViewModel

private enum class MainTab {
    Library,
    Player
}

@Composable
fun WowPlayerApp(viewModel: PlayerViewModel) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val snackbarHostState = remember { SnackbarHostState() }
    var selectedTab by rememberSaveable { mutableStateOf(MainTab.Library) }

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
                onTrackQueue = viewModel::enqueueTrack
            )

            MainTab.Player -> PlayerScreen(
                state = uiState,
                contentPadding = padding,
                onPlayPause = viewModel::togglePlayPause,
                onNext = viewModel::playNext,
                onPrevious = viewModel::playPrevious,
                onSeekTo = viewModel::seekTo,
                onQueueTrackClick = viewModel::playQueueTrack
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
    onTrackQueue: (Track) -> Unit
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

        if (state.libraryTracks.isEmpty()) {
            item {
                Card {
                    Text(
                        modifier = Modifier.padding(16.dp),
                        text = "MediaStore библиотека пока пустая. Можно сразу добавить файлы через SAF picker.",
                        style = MaterialTheme.typography.bodyMedium
                    )
                }
            }
        } else {
            item {
                Text(
                    text = "Треки из MediaStore (${state.libraryTracks.size})",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold
                )
            }

            itemsIndexed(state.libraryTracks) { index, track ->
                TrackRow(
                    track = track,
                    onPlay = { onTrackPlay(index) },
                    onQueue = { onTrackQueue(track) }
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
    onQueueTrackClick: (Int) -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(contentPadding)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
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
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        text = currentTrack.title,
                        style = MaterialTheme.typography.titleLarge,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Text(
                        text = currentTrack.artist,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )

                    Spacer(Modifier.height(16.dp))

                    val duration = state.durationMs.coerceAtLeast(1L)
                    Slider(
                        value = state.positionMs.coerceAtMost(duration).toFloat(),
                        onValueChange = { onSeekTo(it.toLong()) },
                        valueRange = 0f..duration.toFloat()
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
                        IconButton(onClick = onPrevious) {
                            Icon(Icons.Default.SkipPrevious, contentDescription = "Previous")
                        }
                        FilledIconButton(onClick = onPlayPause, modifier = Modifier.size(72.dp)) {
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
                        IconButton(onClick = onNext) {
                            Icon(Icons.Default.SkipNext, contentDescription = "Next")
                        }
                    }
                }
            }
        }

        Text(
            text = "Очередь (${state.queueTracks.size})",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold
        )

        if (state.queueTracks.isEmpty()) {
            Text(
                text = "Пока пусто",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                itemsIndexed(state.queueTracks) { index, track ->
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
private fun TrackRow(
    track: Track,
    onPlay: () -> Unit,
    onQueue: () -> Unit
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.fillMaxWidth()) {
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
                IconButton(onClick = onQueue) {
                    Icon(Icons.Default.Add, contentDescription = "Queue")
                }
                IconButton(onClick = onPlay) {
                    Icon(Icons.Default.PlayArrow, contentDescription = "Play")
                }
            }
            HorizontalDivider()
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
