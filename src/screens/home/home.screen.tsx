import { Notification } from 'expo/build/Notifications/Notifications.types';
import { wallet } from 'nanocurrency-web';
import React, { RefObject } from 'react';
import {
	AppState,
	AppStateStatus,
	EmitterSubscription,
	Keyboard,
	KeyboardAvoidingView,
	StyleSheet,
	TouchableOpacity,
	View,
} from 'react-native';
import { Avatar } from 'react-native-elements';
import { ScrollView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import SideMenu from 'react-native-side-menu-updated'

import { Ionicons } from '@expo/vector-icons';

import NalliCarousel from '../../components/carousel.component';
import DismissKeyboardView from '../../components/dismiss-keyboard-hoc.component';
import NalliButton from '../../components/nalli-button.component';
import NalliLogo from '../../components/svg/nalli-logo';
import Colors from '../../constants/colors';
import Layout from '../../constants/layout';
import layout from '../../constants/layout';
import AuthStore from '../../service/auth-store';
import ContactsService from '../../service/contacts.service';
import CurrencyService from '../../service/currency.service';
import NotificationService from '../../service/notification.service';
import VariableStore, { NalliVariable } from '../../service/variable-store';
import WalletHandler from '../../service/wallet-handler.service';
import WalletStore, { WalletType } from '../../service/wallet-store';
import WalletService, { WalletTransaction } from '../../service/wallet.service';
import NalliMenu from './menu/nalli-menu.component';
import ReceiveSheet from './receive-sheet.component';
import SendSheet from './send-sheet.component';
import TransactionsSheet from './transactions-sheet.component';

interface HomeScreenProps {
	navigation: any;
}

interface HomeScreenState {
	price: number;
	appState: AppStateStatus;
	transactions: WalletTransaction[];
	hasMoreTransactions: boolean;
	isMenuOpen: boolean;
	walletIsOpen: boolean;
}

export default class HomeScreen extends React.Component<HomeScreenProps, HomeScreenState> {

	sendRef: SendSheet;
	sendSheetRef: RefObject<any>;
	receiveSheetRef: RefObject<any>;
	sidemenuRef: SideMenu;
	pushNotificationSubscription;
	subscriptions: EmitterSubscription[] = [];

	constructor(props) {
		super(props);
		this.sendSheetRef = React.createRef();
		this.receiveSheetRef = React.createRef();
		this.state = {
			price: undefined,
			appState: AppState.currentState,
			transactions: undefined,
			hasMoreTransactions: false,
			isMenuOpen: false,
			walletIsOpen: true,
		};
	}

	static navigationOptions = () => ({
		header: null,
	})

	componentDidMount() {
		this.init();
		this.subscriptions.push(VariableStore.watchVariable(NalliVariable.CURRENCY, () => this.getCurrentPrice()));
		this.subscriptions.push(VariableStore.watchVariable(NalliVariable.ACCOUNTS_BALANCES, () => this.fetchTransactions(true)));
	}

	async init() {
		this.getCurrentPrice();
		this.handleForegroundPushNotifications();
		this.fetchTransactions();
		AppState.addEventListener('change', this.handleAppChangeState);
	}

	componentWillUnmount() {
		try {
			AppState.removeEventListener('change', this.handleAppChangeState);
			this.pushNotificationSubscription.remove();
			this.subscriptions.forEach(VariableStore.unwatchVariable);
		} catch {
			// nothing
		}
	}

	handleAppChangeState = (nextAppState) => {
		if (this.state.appState == 'inactive' && nextAppState == 'active') {
			this.setState({ appState: 'active' });
			this.getCurrentPrice();
			ContactsService.clearCache();
		} else if (this.state.appState == 'active'
				&& nextAppState.match(/inactive|background|suspended/)) {
			this.setState({ appState: 'inactive' });
		}
	}

	async handleForegroundPushNotifications() {
		this.pushNotificationSubscription = await NotificationService
				.listenForPushNotifications((notification: Notification) => {
			if (notification.data.data == 'receive') {
				WalletHandler.getAccountsBalancesAndHandlePending();
			} else if (notification.data.data == 'pendingReceived') {
				this.getTransactions();
			}
		});
	}

	onChangeAccount = async (index: number, fetchTransactions = true) => {
		const storedWallet = await WalletStore.getWallet();

		if (storedWallet.accounts[index] !== undefined) {
			await VariableStore.setVariable(NalliVariable.SELECTED_ACCOUNT, storedWallet.accounts[index].address);
			await VariableStore.setVariable(NalliVariable.SELECTED_ACCOUNT_INDEX, index);
			if (fetchTransactions) {
				this.getTransactions();
			}
			this.setState({ walletIsOpen: true });
		} else {
			this.setState({
				walletIsOpen: false,
				transactions: [],
				hasMoreTransactions: false,
			 });
		}
	}

	addNewAccount = async (index: number) => {
		const storedWallet = await WalletStore.getWallet();

		// If account not already present and all previous indexes are present
		if (!storedWallet.accounts[index] && storedWallet.accounts.length === index) {
			let accounts;
			if (storedWallet.type == WalletType.HD_WALLET) {
				accounts = wallet.accounts(storedWallet.seed, index, index);
			} else {
				accounts = wallet.legacyAccounts(storedWallet.seed, index, index);
			}
			const newWallet = { ...storedWallet };
			newWallet.accounts[index] = accounts[0];
			await WalletService.saveNewAccount(accounts[0]);
			await WalletStore.setWallet(newWallet);
			WalletHandler.getAccountsBalancesAndHandlePending();
			this.onChangeAccount(index, false);
		}
	}

	hideAccount = async (index: number) => {
		const storedWallet = await WalletStore.getWallet();

		// If account exists and the account is the last one
		if (storedWallet.accounts[index] && storedWallet.accounts.length === index + 1) {
			const accounts = storedWallet.accounts;
			const newWallet = { ...storedWallet };
			const removed = accounts.pop();
			newWallet.accounts = accounts;
			await WalletService.removeAccount(removed);
			await WalletStore.setWallet(newWallet);
			WalletHandler.getAccountsBalancesAndHandlePending();
			this.onChangeAccount(index - 1, false);
		}
	}

	async fetchTransactions(force = false) {
		if (!this.state.transactions || force) {
			this.getTransactions();
		}
	}

	async getCurrentPrice() {
		const currency = await VariableStore.getVariable(NalliVariable.CURRENCY, 'usd');
		const price = await CurrencyService.getCurrentPrice('xrb', currency);
		this.setState({ price });
		return price;
	}

	async getTransactions() {
		const res = await WalletService.getWalletTransactions(25, 0);
		this.setState({
			transactions: res.sort((a, b) => b.timestamp - a.timestamp),
			hasMoreTransactions: res.length == 25,
		});
		return res;
	}

	getMoreTransactions = async () => {
		const res = await WalletService.getWalletTransactions(25, this.state.transactions.length);
		this.setState({
			transactions: [
				...this.state.transactions,
				...res.sort((a, b) => b.timestamp - a.timestamp),
			],
			hasMoreTransactions: res.length == 25,
		});
	}

	logout = async () => {
		await AuthStore.clearAuthentication();
		this.props.navigation.navigate('Login');
	}

	onSendPress = () => {
		this.sendSheetRef.current.snapTo(1);
	}

	onReceivePress = () => {
		this.receiveSheetRef.current.snapTo(1);
	}

	onSendSuccess = () => {
		WalletHandler.getAccountsBalancesAndHandlePending();
		Keyboard.dismiss();
		this.sendSheetRef.current.snapTo(0);
	}

	onDonatePress = () => {
		this.sidemenuRef.openMenu(false);
		this.onSendPress();
		this.sendRef.toggleDonate(true);
	}

	openMenu = () => {
		this.sidemenuRef.openMenu(true);
	}

	render = () => {
		const {
			appState,
			price,
			transactions,
			hasMoreTransactions,
			walletIsOpen,
		} = this.state;

		if (appState == 'inactive') {
			return (
				<View style={styles.inactiveOverlay}>
					<NalliLogo width={200} height={80} color="white" />
				</View>
			);
		}

		return (
			<SideMenu
					ref={menu => this.sidemenuRef = menu}
					menu={<NalliMenu onDonatePress={this.onDonatePress} />}
					bounceBackOnOverdraw={false}
					toleranceX={20}
					autoClosing={false}>
				<ScrollView scrollEnabled={false}>
					<KeyboardAvoidingView>
						<DismissKeyboardView style={styles.container}>
							<SafeAreaView edges={['top']}>
								<View style={styles.header}>
									<TouchableOpacity style={styles.menuIconContainer} onPress={() => this.openMenu()}>
										<Ionicons style={styles.menuIcon} name="ios-menu" size={40} />
									</TouchableOpacity>
									<NalliLogo style={styles.headerLogo} width={90} height={30} />
									<Avatar
											rounded={true}
											onPress={this.logout}
											icon={{ name: 'lock', type: 'font-awesome' }}
											size="small"
											containerStyle={{ marginRight: 20, marginTop: 15 }}
											overlayContainerStyle={{ backgroundColor: Colors.main }} />
								</View>
							</SafeAreaView>
							<View style={styles.content}>
								<View style={{ height: 230 }}>
									<NalliCarousel
											onChangeAccount={this.onChangeAccount}
											onAddNewAccount={this.addNewAccount}
											onHideAccount={this.hideAccount}
											price={price} />
								</View>
								<View style={[styles.row, styles.actions]}>
									<NalliButton
											text="Send"
											solid={true}
											icon="md-arrow-up"
											style={styles.action}
											onPress={this.onSendPress}
											disabled={!walletIsOpen} />
									<NalliButton
											text="Receive"
											solid={true}
											icon="md-arrow-down"
											style={styles.action}
											onPress={this.onReceivePress}
											disabled={!walletIsOpen} />
								</View>
							</View>
							<TransactionsSheet
									transactions={transactions}
									hasMoreTransactions={hasMoreTransactions}
									onFetchMore={this.getMoreTransactions} />
							<SendSheet
									ref={c => this.sendRef = c}
									reference={this.sendSheetRef}
									onSendSuccess={this.onSendSuccess} />
							<ReceiveSheet reference={this.receiveSheetRef} />
						</DismissKeyboardView>
					</KeyboardAvoidingView>
				</ScrollView>
			</SideMenu>
		);
	}

}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: 'white',
		height: layout.window.height,
	},
	inactiveOverlay: {
		flex: 1,
		backgroundColor: Colors.main,
		justifyContent: 'center',
		alignItems: 'center',
	},
	header: {
		flexDirection: 'row',
		justifyContent: 'space-between',
	},
	menuIconContainer: {
		marginTop: 10,
		marginLeft: 20,
		marginRight: -20,
		color: Colors.main,
	},
	menuIcon: {
		color: Colors.main,
	},
	headerLogo: {
		marginTop: 15,
		marginLeft: 15,
		color: Colors.main,
	},
	content: {
		flex: 2,
		backgroundColor: 'white',
		flexDirection: 'column',
		justifyContent: 'space-between',
		marginBottom: layout.window.height * 0.24,
	},
	row: {
		marginTop: 10,
		marginBottom: 10,
	},
	actions: {
		padding: 15,
		flexDirection: 'row',
		justifyContent: 'space-between',
	},
	action: {
		width: (Number(Layout.window.width) - 50) / 2,
	},
});
