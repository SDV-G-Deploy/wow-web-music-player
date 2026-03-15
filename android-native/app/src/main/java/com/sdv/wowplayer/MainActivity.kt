package com.sdv.wowplayer

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import com.sdv.wowplayer.domain.player.PlayerViewModel
import com.sdv.wowplayer.ui.WowPlayerApp
import com.sdv.wowplayer.ui.theme.WowNativeTheme

class MainActivity : ComponentActivity() {

    private val viewModel: PlayerViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            WowNativeTheme {
                WowPlayerApp(viewModel = viewModel)
            }
        }
    }

    override fun onStart() {
        super.onStart()
        viewModel.onHostStarted()
    }

    override fun onStop() {
        viewModel.onHostStopped()
        super.onStop()
    }
}
