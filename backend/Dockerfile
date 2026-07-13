FROM eclipse-temurin:21-jdk-jammy AS builder

WORKDIR /workspace

COPY gradlew gradlew
COPY gradle gradle
COPY build.gradle settings.gradle ./
COPY src src

RUN chmod +x gradlew && ./gradlew bootJar --no-daemon

FROM eclipse-temurin:21-jre-jammy

WORKDIR /app

COPY --from=builder /workspace/build/libs/room-reservation-backend-0.0.1-SNAPSHOT.jar app.jar

USER 10001

EXPOSE 10000

ENTRYPOINT ["java", "-jar", "/app/app.jar"]
