module tweet_tip::tweet_tip {

    use std::string::{String};
    use std::option;
    use moveos_std::table::{Self, Table};
    use moveos_std::object::{Self, Object};
    use moveos_std::signer;

    use rooch_framework::coin_store::{Self, CoinStore};
    use rooch_framework::account_coin_store;
    use rooch_framework::gas_coin::{RGas};

    use twitter_binding::twitter_account;

    const ErrorInsufficientBalance: u64 = 1;
    const ErrorAccountNotBind: u64 = 2;
    const ErrorNoTipToClaim: u64 = 3;
    const ErrorInvalidAmount: u64 = 4;

    struct Tips has key {
        rgas_store: Object<CoinStore<RGas>>,
        tip_records: Table<String, u256>
    }

    fun init() {
        let tip_store = coin_store::create_coin_store<RGas>();
        let tips = Tips { rgas_store: tip_store, tip_records: table::new() };
        let tips_obj = object::new_named_object(tips);
        object::transfer_extend(tips_obj, @tweet_tip);
    }

    public entry fun tip(sender: &signer, author_id: String, amount: u256) {
        assert!(amount > 0, ErrorInvalidAmount);
        let addr = signer::address_of(sender);
        let account_balance = account_coin_store::balance<RGas>(addr);
        assert!(account_balance > amount, ErrorInsufficientBalance);

        let rgas_coin = account_coin_store::withdraw<RGas>(sender, amount);
        let tips = borrow_mut_tips();
        coin_store::deposit(&mut tips.rgas_store, rgas_coin);

        if (table::contains(&tips.tip_records, author_id)) {
            let awards = table::borrow_mut(&mut tips.tip_records, author_id);
            *awards = *awards + amount;
        } else {
            table::add(&mut tips.tip_records, author_id, amount);
        }
    }

    public entry fun claim_tip(receiver: &signer) {
        let author_addr = signer::address_of(receiver);
        let author_id_opt = twitter_account::resolve_author_id_by_address(author_addr);
        assert!(option::is_some(&author_id_opt), ErrorAccountNotBind);

        let author_id = option::destroy_some(author_id_opt);
        let tips = borrow_mut_tips();
        assert!(table::contains(&tips.tip_records, author_id), ErrorNoTipToClaim);

        let awards = table::borrow(&tips.tip_records, author_id);
        let rgas_coin = coin_store::withdraw(&mut tips.rgas_store, *awards);
        account_coin_store::deposit<RGas>(author_addr, rgas_coin);
        table::remove(&mut tips.tip_records, author_id);
    }

    fun borrow_mut_tips(): &mut Tips {
        let tips_id = object::named_object_id<Tips>();
        let tips_obj = object::borrow_mut_object_extend<Tips>(tips_id);
        object::borrow_mut(tips_obj)
    }
}
