import java.io.File

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

val releaseKeystorePath = System.getenv("WOW_ANDROID_KEYSTORE_PATH")
val releaseKeystorePassword = System.getenv("WOW_ANDROID_KEYSTORE_PASSWORD")
val releaseKeyAlias = System.getenv("WOW_ANDROID_KEY_ALIAS")
val releaseKeyPassword = System.getenv("WOW_ANDROID_KEY_PASSWORD")

val hasReleaseSigningEnv = listOf(
    releaseKeystorePath,
    releaseKeystorePassword,
    releaseKeyAlias,
    releaseKeyPassword
).all { !it.isNullOrBlank() }

android {
    namespace = "com.sdv.wowplayer"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.sdv.wowplayer"
        minSdk = 26
        targetSdk = 35
        versionCode = 3
        versionName = "0.3.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    signingConfigs {
        create("release") {
            if (hasReleaseSigningEnv) {
                storeFile = file(requireNotNull(releaseKeystorePath))
                storePassword = releaseKeystorePassword
                keyAlias = releaseKeyAlias
                keyPassword = releaseKeyPassword
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            if (hasReleaseSigningEnv) {
                signingConfig = signingConfigs.getByName("release")
            }
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.10.01")
    implementation(composeBom)
    androidTestImplementation(composeBom)

    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.7")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")

    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("com.google.android.material:material:1.12.0")

    val media3Version = "1.4.1"
    implementation("androidx.media3:media3-exoplayer:$media3Version")
    implementation("androidx.media3:media3-session:$media3Version")

    debugImplementation("androidx.compose.ui:ui-tooling")
    debugImplementation("androidx.compose.ui:ui-test-manifest")

    testImplementation("junit:junit:4.13.2")
    testImplementation("org.mockito:mockito-core:5.12.0")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.6.1")
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
}

tasks.register("verifyReleaseSigningEnv") {
    group = "verification"
    description = "Fails fast when release signing env vars are missing"

    doLast {
        val required = mapOf(
            "WOW_ANDROID_KEYSTORE_PATH" to System.getenv("WOW_ANDROID_KEYSTORE_PATH"),
            "WOW_ANDROID_KEYSTORE_PASSWORD" to System.getenv("WOW_ANDROID_KEYSTORE_PASSWORD"),
            "WOW_ANDROID_KEY_ALIAS" to System.getenv("WOW_ANDROID_KEY_ALIAS"),
            "WOW_ANDROID_KEY_PASSWORD" to System.getenv("WOW_ANDROID_KEY_PASSWORD")
        )

        val missing = required
            .filterValues { it.isNullOrBlank() }
            .keys
            .toList()

        if (missing.isNotEmpty()) {
            throw GradleException(
                "Missing release signing environment variables: ${missing.joinToString(", ")}. " +
                    "Configure them in CI/local shell before running release tasks."
            )
        }

        val keystorePath = required.getValue("WOW_ANDROID_KEYSTORE_PATH")
        if (!File(keystorePath).exists()) {
            throw GradleException("Keystore file not found at WOW_ANDROID_KEYSTORE_PATH=$keystorePath")
        }
    }
}

tasks.matching { task ->
    task.name in setOf("assembleRelease", "bundleRelease", "packageRelease")
}.configureEach {
    dependsOn("verifyReleaseSigningEnv")
}