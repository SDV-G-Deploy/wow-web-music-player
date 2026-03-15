package com.sdv.wowplayer

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class SmokeUiTest {

    @get:Rule
    val composeRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun appLaunches_andMainTabsAreReachable() {
        composeRule.onNodeWithText("WOW Native Player").assertIsDisplayed()

        composeRule.onNodeWithText("Плеер").performClick()
        composeRule.onNodeWithText("Очередь пуста. Добавьте файлы на экране библиотеки.").assertIsDisplayed()

        composeRule.onNodeWithText("Плейлисты").performClick()
        composeRule.onNodeWithText("Плейлисты").assertIsDisplayed()

        composeRule.onNodeWithText("Библиотека").performClick()
        composeRule.onNodeWithText("Добавить треки").assertIsDisplayed()
    }
}