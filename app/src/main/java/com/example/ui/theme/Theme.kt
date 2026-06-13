package com.example.ui.theme

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext

private val DarkColorScheme = darkColorScheme(
  primary = NeonCyan,
  onPrimary = DarkBackground,
  secondary = RoyalBlue,
  onSecondary = TextWhite,
  tertiary = EmeraldGreen,
  onTertiary = DarkBackground,
  background = DarkBackground,
  onBackground = TextWhite,
  surface = DarkSurface,
  onSurface = TextWhite,
  surfaceVariant = SurfaceCard,
  onSurfaceVariant = TextMuted,
  error = LaserRed,
  onError = TextWhite
)

@Composable
fun MyApplicationTheme(
  darkTheme: Boolean = true, // Force premium dark theme always as requested
  dynamicColor: Boolean = false, // Disable dynamic material-you colors to lock in branding
  content: @Composable () -> Unit,
) {
  val colorScheme = DarkColorScheme

  MaterialTheme(
    colorScheme = colorScheme,
    typography = Typography,
    content = content
  )
}
