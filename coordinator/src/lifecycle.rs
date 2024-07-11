use crate::indexer_config::IndexerConfig;

#[derive(Default)]
enum LifeCycle {
    #[default]
    Provisioning,
    Running,
    Stopping,
    Stopped,
    Deprovisioning,
    Erroring,
    Deleted,
}

struct LifecycleManager {
    indexer_config: IndexerConfig,
}

impl LifecycleManager {
    fn new(indexer_config: IndexerConfig) -> LifecycleManager {
        LifecycleManager { indexer_config }
    }

    fn start(&self) {
        println!("Starting lifecycle manager");
    }
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn something() {
        let config = IndexerConfig::default();
        let _manager = LifecycleManager::new(config);
        let mut lifecycle = LifeCycle::default();
        let enabled = true;
        loop {
            // fetch state and create if doesn't exist
            // fetch config - it should exist

            match lifecycle {
                LifeCycle::Provisioning => {
                    // do something
                    lifecycle = LifeCycle::Running;
                }
                LifeCycle::Running => {
                    // ensure block stream/executor are running
                    // get config
                    // do something
                    // change state
                    if !enabled {
                        lifecycle = LifeCycle::Stopping;
                    }
                }
                LifeCycle::Stopping => {
                    // do something
                    // change state
                }
                LifeCycle::Stopped => {
                    // do something
                    // change state
                }
                LifeCycle::Deprovisioning => {
                    // do something
                    // change state
                }
                LifeCycle::Erroring => {
                    // clean up
                }
                LifeCycle::Deleted => {
                    // clean up
                    break;
                }
            }
        }
    }
}
