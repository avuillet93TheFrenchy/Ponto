plugins {
    `kotlin-dsl`
}

gradlePlugin {
    plugins {
        create("pluginsForCoolKids") {
            id = "rust"
            implementationClass = "RustPlugin"
        }
    }
}

repositories {
    google()
    mavenCentral()
}

val androidGradlePluginVersion = "9.4.1"

dependencies {
    compileOnly(gradleApi())
    implementation("com.android.tools.build:gradle:$androidGradlePluginVersion")
}
