package com.school.reservation.domain.settings;

import com.school.reservation.domain.settings.dto.response.LogoUploadResponse;
import com.school.reservation.domain.settings.dto.response.LogoCleanupResponse;
import jakarta.annotation.PostConstruct;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;
import javax.imageio.ImageIO;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

@Service
public class LogoStorageService {

    private static final Logger log = LoggerFactory.getLogger(LogoStorageService.class);
    private static final Set<String> ALLOWED_CONTENT_TYPES = Set.of("image/png", "image/jpeg");

    private final Path logoRoot;

    public LogoStorageService(@Value("${app.upload.logo-dir:uploads/logos}") String logoDir) {
        this.logoRoot = Path.of(logoDir).toAbsolutePath().normalize();
    }

    @PostConstruct
    void ensureDirectory() throws IOException {
        Files.createDirectories(logoRoot);
    }

    public LogoUploadResponse store(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("Logo file is required.");
        }
        String contentType = file.getContentType();
        if (contentType == null || !ALLOWED_CONTENT_TYPES.contains(contentType.toLowerCase(Locale.ROOT))) {
            throw new IllegalArgumentException("Logo must be a PNG or JPEG image.");
        }

        try {
            BufferedImage image = ImageIO.read(file.getInputStream());
            if (image == null) {
                throw new IllegalArgumentException("Logo image cannot be read.");
            }
            if (image.getWidth() != image.getHeight()) {
                throw new IllegalArgumentException("Logo image must be square.");
            }

            String extension = "image/png".equalsIgnoreCase(contentType) ? ".png" : ".jpg";
            String fileName = UUID.randomUUID() + extension;
            Path target = logoRoot.resolve(fileName).normalize();
            if (!target.startsWith(logoRoot)) {
                throw new IllegalArgumentException("Invalid logo file name.");
            }
            file.transferTo(target);
            return new LogoUploadResponse("/api/public/settings/logo/" + fileName);
        } catch (IOException exception) {
            throw new IllegalStateException("Failed to store logo image.", exception);
        }
    }

    public Resource load(String fileName) {
        String safeName = Path.of(fileName).getFileName().toString();
        Path file = logoRoot.resolve(safeName).normalize();
        if (!file.startsWith(logoRoot) || !Files.exists(file)) {
            throw new IllegalArgumentException("Logo image not found.");
        }
        try {
            return new UrlResource(file.toUri());
        } catch (IOException exception) {
            throw new IllegalStateException("Failed to load logo image.", exception);
        }
    }

    public void deleteStoredLogo(String logoUrl) {
        storedLogoPath(logoUrl).ifPresent(path -> {
            try {
                Files.deleteIfExists(path);
            } catch (IOException exception) {
                throw new IllegalStateException("Failed to delete previous logo image.", exception);
            }
        });
    }

    public LogoCleanupResponse cleanupOrphanLogos(Set<String> referencedLogoUrls, Duration gracePeriod) {
        Set<Path> referencedPaths = referencedLogoUrls.stream()
            .map(this::storedLogoPath)
            .flatMap(Optional::stream)
            .map(Path::normalize)
            .collect(Collectors.toSet());
        Instant cutoff = Instant.now().minus(gracePeriod);

        AtomicInteger scanned = new AtomicInteger();
        AtomicInteger deleted = new AtomicInteger();
        AtomicInteger skippedReferenced = new AtomicInteger();
        AtomicInteger skippedRecent = new AtomicInteger();
        AtomicInteger failed = new AtomicInteger();

        try (var files = Files.list(logoRoot)) {
            files
                .map(path -> path.toAbsolutePath().normalize())
                .filter(path -> path.startsWith(logoRoot))
                .filter(Files::isRegularFile)
                .forEach(path -> {
                    scanned.incrementAndGet();
                    if (referencedPaths.contains(path)) {
                        skippedReferenced.incrementAndGet();
                        return;
                    }
                    try {
                        if (Files.getLastModifiedTime(path).toInstant().isAfter(cutoff)) {
                            skippedRecent.incrementAndGet();
                            return;
                        }
                        Files.deleteIfExists(path);
                        deleted.incrementAndGet();
                    } catch (IOException exception) {
                        failed.incrementAndGet();
                        log.warn("Logo orphan cleanup failed for file={}", path.getFileName(), exception);
                    }
                });
        } catch (IOException exception) {
            failed.incrementAndGet();
            log.warn("Logo orphan cleanup could not scan logo directory={}", logoRoot, exception);
        }

        return new LogoCleanupResponse(
            scanned.get(),
            deleted.get(),
            skippedReferenced.get(),
            skippedRecent.get(),
            failed.get()
        );
    }

    private Optional<Path> storedLogoPath(String logoUrl) {
        if (logoUrl == null || logoUrl.isBlank()) {
            return Optional.empty();
        }
        String prefix = "/api/public/settings/logo/";
        if (!logoUrl.startsWith(prefix)) {
            return Optional.empty();
        }
        String fileName = Path.of(logoUrl.substring(prefix.length())).getFileName().toString();
        Path file = logoRoot.resolve(fileName).normalize();
        if (!file.startsWith(logoRoot)) {
            return Optional.empty();
        }
        return Optional.of(file);
    }
}
