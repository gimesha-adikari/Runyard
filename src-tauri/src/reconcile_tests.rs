#[cfg(test)]
mod tests {
    use std::path::Path;

    #[test]
    fn test_path_ancestry() {
        let parent = Path::new("/app/project_a");
        let child1 = Path::new("/app/project_a_backup");
        let child2 = Path::new("/app/project_a/frontend");

        assert!(
            !child1.starts_with(parent),
            "starts_with should fail for string prefixes"
        );
        assert!(
            child2.starts_with(parent),
            "starts_with should succeed for actual children"
        );
    }
}
